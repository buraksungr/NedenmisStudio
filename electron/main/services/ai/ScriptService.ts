import { estimateSpeechDuration, generateSubtitleCues, id } from '../../../../shared/utils.js';
import { composeScript, parseScriptSections } from '../../../../shared/script.js';
import { defaultSceneAnimation } from '../../../../shared/visuals/sceneAnimation.js';
import type { ChannelIdentity, Project, Scene, ScriptSections } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { LlmProvider, SceneDirection } from './LlmProvider.js';

export class ScriptService {
  constructor(private readonly projects: ProjectRepository, private readonly providers: Map<string, LlmProvider>, private activeProviderId: () => string, private readonly identity?: () => ChannelIdentity) {}
  private provider(): LlmProvider { return this.providers.get(this.activeProviderId()) || this.providers.get('local-script')!; }
  /**
   * Senaryo üretir.
   *
   * `useResearch` sözleşmede belirtilir: false ise araştırma sonuçları
   * sağlayıcıya verilmez (kullanıcı yalnızca kendi bilgisine dayanacak bir
   * taslak istiyorsa). Varsayılan `true` — eski davranış.
   */
  async generate(projectId: string, useResearch = true): Promise<Project> {
    const project = this.projects.get(projectId);
    const provider = this.provider();
    const research = useResearch ? project.research : { status: 'not_started' as const, sources: [] };
    let generated = '';
    try {
      generated = (await provider.generateScript({ topic: project.topic, category: project.category, targetDuration: project.targetDuration, narrationStyle: project.narrationStyle, instructions: project.instructions, research })).trim();
    } catch (error) {
      // Sağlayıcı hatası kullanıcıya anlamsız bir Zod/ham hata olarak yansımasın.
      throw new Error(`Senaryo üretilemedi: ${error instanceof Error ? error.message : 'bilinmeyen hata'}`);
    }
    if (!generated) throw new Error('Senaryo üretilemedi: sağlayıcı boş metin döndürdü.');
    const sections = parseScriptSections(generated);
    project.scriptSections = sections; project.script = composeScript(sections);
    project.status = 'script_ready'; project.scenes = [];
    return this.projects.update(project);
  }
  async rewrite(projectId: string, selectedText: string, instruction: string): Promise<string> {
    const project = this.projects.get(projectId);
    const humanInstruction = ({ improve: 'Daha akıcı, doğal ve anlaşılır yap', shorten: 'Anlamı koruyarak kısalt', hook: 'Güçlü bir merak kancasına dönüştür', conclusion: 'Akılda kalıcı bir sonuca dönüştür' } as Record<string, string>)[instruction] || instruction;
    const provider = this.provider();
    return (await provider.rewrite(project, selectedText, provider.id === 'local-script' ? instruction : humanInstruction)).trim();
  }
  async generateScenes(projectId: string): Promise<Project> {
    const project = this.projects.get(projectId);
    if (!project.script.trim()) throw new Error('Sahnelere ayırmadan önce bir anlatım metni oluşturun.');
    const sections = project.scriptSections || parseScriptSections(project.script);
    project.scriptSections = sections; project.script = composeScript(sections);
    const directions = this.structuredDirections(project, sections);
    const identity = this.identity?.();
    if (identity?.introEnabled) directions.unshift({ section: 'intro', narration: identity.tagline, visualDescription: `${identity.channelName} kanal açılışı; merak sorusunu çağrıştıran kanal işareti ve soyut soru formu.`, visualPrompt: `${identity.channelName} için metinsiz, premium bilim kanalı açılış kompozisyonu, soru işareti formu, dikey.` });
    // Üretilmiş anlamlı sonuç varken her videoda aynı genel soruyu tekrarlayan outro ekleme.
    if (identity?.outroEnabled && identity.outroText.trim() && !sections.conclusion.trim()) directions.push({ section: 'outro', narration: identity.outroText, visualDescription: `${identity.channelName} kapanışında izleyiciyi yeni bir soruya davet eden kanal renklerinde sonuç kartı.`, visualPrompt: `${identity.channelName} bilim kanalı kapanışı, merak ve soru işareti, kanal rengi ${identity.primaryColor}, dikey, metinsiz.` });
    const estimatedTotal = directions.reduce((sum, direction) => sum + estimateSpeechDuration(direction.narration, project.narrationStyle, project.voice.speed), 0);
    const ratio = project.targetDuration / Math.max(estimatedTotal, 1);
    let cursor = 0;
    project.scenes = directions.map((direction, index): Scene => {
      const estimated = estimateSpeechDuration(direction.narration, project.narrationStyle, project.voice.speed);
      const duration = Math.max(2.5, Number((estimated * Math.min(1.25, Math.max(.75, ratio))).toFixed(2)));
      const scene: Scene = {
        id: id('scene'), number: index + 1, narration: direction.narration.trim(), section: direction.section,
        visualDescription: direction.visualDescription, visualPrompt: direction.visualPrompt, assetType: 'procedural', duration,
        transition: index === 0 ? 'fade' : project.visualStyle === 'minimal' ? 'dissolve' : 'fade',
        cameraMovement: 'static', animation: defaultSceneAnimation(),
        subtitles: generateSubtitleCues(direction.narration, duration, cursor), subtitleTiming: 'estimated', status: 'empty',
      };
      cursor += duration; return scene;
    });
    project.status = 'scenes_ready'; return this.projects.update(project);
  }

  private structuredDirections(project: Project, sections: ScriptSections): SceneDirection[] {
    const direction = (narration: string, section: SceneDirection['section']): SceneDirection => ({
      narration: narration.trim(), section,
      // Sınıflandırma hem KONU hem anlatım metnini kullanır: yerel sağlayıcı
      // anlatımı jenerik yazdığında bile sahne konuya özgü kalır.
      visualDescription: this.visualDirection(`${project.topic} ${narration}`, section === 'hook' ? 0 : 1, 3),
      visualPrompt: `${project.topic}, ${narration}. Dikey 9:16 eğitici bilimsel infografik; hareketli nesneler ve anlatımla doğrudan ilişkili mekanizma, yazısız.`,
    });
    const explanationSentences = sections.explanation.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) || [];
    const sceneCount = Math.max(1, Math.min(explanationSentences.length, Math.ceil(project.targetDuration / 10) - 2));
    const groups: string[][] = Array.from({ length: sceneCount }, () => []);
    explanationSentences.forEach((sentence, index) => {
      const group = Math.min(sceneCount - 1, Math.floor(index * sceneCount / explanationSentences.length));
      groups[group].push(sentence);
    });
    return [
      direction(sections.hook, 'hook'),
      ...groups.filter((group) => group.length).map((group) => direction(group.join(' '), 'explanation')),
      direction(sections.conclusion, 'conclusion'),
    ];
  }

  /**
   * Sahnenin görsel yönlendirmesi.
   *
   * BUILD 44: önceki sürüm yalnızca altı anahtar sözcük tanıyordu; geri
   * kalan her konu "Merak uyandıran ana soruyu simgeleyen merkez form" gibi
   * genel bir metne düşüyordu. Bu metin görsel motoruna girdiği için konuya
   * özgü olmayan sahneler konuya özgü olmayan görsel üretiyordu. Artık
   * metin, konu sınıflandırıcısıyla eşleştirilir ve alana özgü, konuyu
   * gerçekten anlatan bir yönlendirme yazılır.
   */
  private visualDirection(text: string, index: number, total: number): string {
    const lower = text.toLocaleLowerCase('tr-TR');
    const stem = (term: string) => new RegExp(`(?<![a-zçğıöşü])${term}`, 'i').test(lower);
    if (stem('gökyüzü') || stem('rayleigh') || (stem('ışık') && (stem('mavi') || stem('saçıl')))) return 'Güneş ışığı atmosfere girerken dalga boylarının saçılmasını katmanlı ışınlar ve parçacıklarla gösteren bilimsel diyagram.';
    if (stem('galaksi') || (stem('yıldız') && (stem('doğ') || stem('bulut')))) return 'Yıldızın bir gaz bulutundan doğuşunu sarmal kollar ve çekim kuvveti çizgileriyle gösteren derin uzay kompozisyonu.';
    if (stem('gezegen') || stem('yörünge') || stem('uzay') || stem('kara delik')) return 'Anlatılan gök cisimlerini ölçek ilişkisi ve yörünge çizgileriyle gösteren derin uzay kompozisyonu.';
    if (stem('beyin') || stem('hafıza') || stem('nöron') || stem('bellek')) return 'Beyindeki ilgili bölgeler ve bilgi akışı arasındaki bağlantıyı gösteren hareketli nöral ağ diyagramı.';
    // Pigment/kromatofor kuralı, kürk/deri kuralından ÖNCE gelir: "derisindeki
    // kromatofor" ifadesi her iki kurala da uyar ve öncelik doğru kuralı seçmeli.
    if (stem('kromatofor') || stem('pigment') || stem('renk değiştir')) return 'Canlının derisindeki pigment hücrelerinin genişleme ve daralmasını gösteren renk değiştirme kesiti.';
    if (stem('kürk') || (stem('deri') && (stem('tüy') || stem('siyah') || stem('kürk')))) return 'Kürk ve deri kesitini, ışığın soğurulmasıyla birlikte mikroskobik tüy yapısıyla gösteren ışık soğurma diyagramı.';
    if (stem('hücre') || stem('mitoz') || stem('nükleus') || stem('bölün')) return 'Hücrenin zar, çekirdek ve organel yapısını ya da bölünme aşamalarını gösteren mikroskobik hücre diyagramı.';
    if (stem('nehir') || stem('akarsu') || stem('erozyon') || stem('toprak')) return 'Akarsuyun toprak ve çakıl taşımasını, erozyonu ve çökelmeyi gösteren nehir kanalı kesiti.';
    if (stem('molekül') || stem('buz') || stem('deniz') || stem('okyanus') || stem('yoğunluk')) return 'Su molekülleri ve anlatılan fiziksel değişimin önce-sonra durumunu gösteren kesit infografiği.';
    if (stem('fotosentez') || stem('tepkime') || stem('atom') || stem('moleküler') || stem('kimya')) return 'Atom ve molekül bağlarının oluşumunu gösteren reaksiyon şeması.';
    if (stem('kuvvet') || stem('enerji') || stem('hız') || stem('mıknatıs') || stem('elektrik')) return 'Kuvvet, enerji ve hareket yönlerini oklarla gösteren kuvvet diyagramı.';
    if (stem('yer kabuğu') || stem('deprem') || stem('volkan') || stem('levha')) return 'Yer kabuğu katmanlarını, levha hareketlerini ve magmayı gösteren jeolojik kesit.';
    if (stem('bulut') || stem('yağmur') || stem('hava') || stem('fırtına') || stem('iklim')) return 'Bulut oluşumu, yağış ve rüzgâr akışını gösteren hava durumu diyagramı.';
    if (stem('teknoloji') || stem('yapay zeka') || stem('yapay zekâ') || stem('çip') || stem('devre')) return 'Veri akışını ve bağlantı noktalarını gösteren devre şeması.';
    if (stem('hayvan') || stem('ahtapot') || stem('balık') || stem('kuş') || stem('böcek') || stem('ayı') || stem('penguen')) return 'Canlının davranışını ve çevresiyle kurduğu ilişkiyi açıklayan yakın plan illüstrasyon ve işaretli oklar.';
    return `${index === 0 ? 'Merak uyandıran ana soruyu simgeleyen merkez form' : index === total - 1 ? 'Açıklamanın bütününü birleştiren sonuç diyagramı' : 'Anlatılan mekanizmayı adım adım açıklayan katmanlı süreç diyagramı'}; sahnedeki şu ifadeyle doğrudan ilişkili: ${text.slice(0, 180)}`;
  }
}
