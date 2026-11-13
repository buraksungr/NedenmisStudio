import { estimateSpeechDuration, generateSubtitleCues, id } from '../../../../shared/utils.js';
import { composeScript, parseScriptSections } from '../../../../shared/script.js';
import { defaultSceneAnimation } from '../../../../shared/visuals/sceneAnimation.js';
import type { ChannelIdentity, Project, Scene, ScriptSections } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { LlmProvider, SceneDirection } from './LlmProvider.js';

export class ScriptService {
  constructor(private readonly projects: ProjectRepository, private readonly providers: Map<string, LlmProvider>, private activeProviderId: () => string, private readonly identity?: () => ChannelIdentity) {}
  private provider(): LlmProvider { return this.providers.get(this.activeProviderId()) || this.providers.get('local-script')!; }
  async generate(projectId: string): Promise<Project> {
    const project = this.projects.get(projectId);
    const generated = (await this.provider().generateScript({ topic: project.topic, category: project.category, targetDuration: project.targetDuration, narrationStyle: project.narrationStyle, instructions: project.instructions, research: project.research })).trim();
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
      visualDescription: this.visualDirection(narration, section === 'hook' ? 0 : 1, 3),
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

  private visualDirection(text: string, index: number, total: number): string {
    const lower = text.toLocaleLowerCase('tr-TR');
    if (/gökyüzü|mavi|ışık|güneş/.test(lower)) return 'Güneş ışığı atmosfere girerken dalga boylarının saçılmasını katmanlı ışınlar ve parçacıklarla gösteren bilimsel diyagram.';
    if (/ay|kara delik|uzay|dünya|yıldız|gezegen/.test(lower)) return 'Anlatılan gök cisimlerini ölçek ilişkisi ve yörünge çizgileriyle gösteren derin uzay kompozisyonu.';
    if (/beyin|hafıza|zaman|bellek|deja/.test(lower)) return 'Beyindeki ilgili bölgeler ve bilgi akışı arasındaki bağlantıyı gösteren hareketli nöral ağ diyagramı.';
    if (/su|buz|deniz|okyanus|molekül/.test(lower)) return 'Su molekülleri ve anlatılan fiziksel değişimin önce-sonra durumunu gösteren kesit infografiği.';
    if (/kedi|karınca|hayvan|ayı|böcek/.test(lower)) return 'Canlının davranışını ve çevresiyle kurduğu ilişkiyi açıklayan yakın plan illüstrasyon ve işaretli oklar.';
    return `${index === 0 ? 'Merak uyandıran ana soruyu simgeleyen merkez form' : index === total - 1 ? 'Açıklamanın bütününü birleştiren sonuç diyagramı' : 'Anlatılan mekanizmayı adım adım açıklayan katmanlı süreç diyagramı'}; sahnedeki şu ifadeyle doğrudan ilişkili: ${text.slice(0, 180)}`;
  }
}
