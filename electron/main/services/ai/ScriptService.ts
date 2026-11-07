import { estimateSpeechDuration, generateSubtitleCues, id } from '../../../../shared/utils.js';
import type { ChannelIdentity, Project, Scene } from '../../../../shared/types.js';
import type { ProjectRepository } from '../../infrastructure/database/ProjectRepository.js';
import type { LlmProvider, SceneDirection } from './LlmProvider.js';

export class ScriptService {
  constructor(private readonly projects: ProjectRepository, private readonly providers: Map<string, LlmProvider>, private activeProviderId: () => string, private readonly identity?: () => ChannelIdentity) {}
  private provider(): LlmProvider { return this.providers.get(this.activeProviderId()) || this.providers.get('local-script')!; }
  async generate(projectId: string): Promise<Project> {
    const project = this.projects.get(projectId);
    project.script = (await this.provider().generateScript({ topic: project.topic, category: project.category, targetDuration: project.targetDuration, narrationStyle: project.narrationStyle, instructions: project.instructions, research: project.research })).trim();
    project.status = 'script_ready'; project.scenes = [];
    return this.projects.update(project);
  }
  async rewrite(projectId: string, selectedText: string, instruction: string): Promise<string> {
    const project = this.projects.get(projectId);
    const humanInstruction = ({ improve: 'Daha akıcı, doğal ve anlaşılır yap', shorten: 'Anlamı koruyarak kısalt', hook: 'Güçlü bir merak kancasına dönüştür', conclusion: 'Akılda kalıcı bir sonuca dönüştür' } as Record<string, string>)[instruction] || instruction;
    return (await this.provider().rewrite(project, selectedText, humanInstruction)).trim();
  }
  async generateScenes(projectId: string): Promise<Project> {
    const project = this.projects.get(projectId);
    if (!project.script.trim()) throw new Error('Sahnelere ayırmadan önce bir anlatım metni oluşturun.');
    let directions: SceneDirection[] | undefined;
    if (this.provider().directScenes && this.provider().id !== 'local-script') {
      try { directions = await this.provider().directScenes!(project); } catch (error) { project.recoveryNote = `Yapay zekâ sahne yönetimi kullanılamadı; metin yerel olarak sahnelere ayrıldı. ${error instanceof Error ? error.message : ''}`; }
    }
    if (!directions?.length) directions = this.localDirections(project);
    const identity = this.identity?.();
    if (identity?.introEnabled) directions.unshift({ narration: identity.tagline, visualDescription: `${identity.channelName} kanal açılışı; merak sorusunu çağrıştıran kanal işareti ve soyut soru formu.`, visualPrompt: `${identity.channelName} için metinsiz, premium bilim kanalı açılış kompozisyonu, soru işareti formu, dikey.` });
    if (identity?.outroEnabled && identity.outroText.trim()) directions.push({ narration: identity.outroText, visualDescription: `${identity.channelName} kapanışında izleyiciyi yeni bir soruya davet eden kanal renklerinde sonuç kartı.`, visualPrompt: `${identity.channelName} bilim kanalı kapanışı, merak ve soru işareti, kanal rengi ${identity.primaryColor}, dikey, metinsiz.` });
    const estimatedTotal = directions.reduce((sum, direction) => sum + estimateSpeechDuration(direction.narration, project.narrationStyle, project.voice.speed), 0);
    const ratio = project.targetDuration / Math.max(estimatedTotal, 1);
    let cursor = 0;
    project.scenes = directions.map((direction, index): Scene => {
      const estimated = estimateSpeechDuration(direction.narration, project.narrationStyle, project.voice.speed);
      const duration = Math.max(2.5, Number((estimated * Math.min(1.25, Math.max(.75, ratio))).toFixed(2)));
      const scene: Scene = {
        id: id('scene'), number: index + 1, narration: direction.narration.trim(), visualDescription: direction.visualDescription,
        visualPrompt: direction.visualPrompt, assetType: 'procedural', duration,
        transition: index === 0 ? 'fade' : project.visualStyle === 'minimal' ? 'dissolve' : 'fade',
        cameraMovement: index % 3 === 0 ? 'zoom-in' : index % 3 === 1 ? 'pan-right' : 'zoom-out',
        subtitles: generateSubtitleCues(direction.narration, duration, cursor), subtitleTiming: 'estimated', status: 'empty',
      };
      cursor += duration; return scene;
    });
    project.status = 'scenes_ready'; return this.projects.update(project);
  }
  private localDirections(project: Project): SceneDirection[] {
    const paragraphs = project.script.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const sentences = paragraphs.flatMap((p) => p.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [p]);
    const targetCount = Math.max(3, Math.min(9, Math.ceil(project.targetDuration / 10)));
    const groups: string[][] = Array.from({ length: Math.min(targetCount, sentences.length) }, () => []);
    let group = 0;
    for (const sentence of sentences) { groups[Math.min(group, groups.length - 1)].push(sentence.trim()); if (groups[group].join(' ').split(/\s+/).length > project.targetDuration / targetCount * 2.1 && group < groups.length - 1) group += 1; }
    return groups.filter((g) => g.length).map((words, index) => {
      const narration = words.join(' ');
      return { narration, visualDescription: this.visualDirection(narration, index, groups.length), visualPrompt: `${project.topic}, ${narration}. Dikey 9:16 eğitici belgesel görseli, bilimsel süreci açıklayan katmanlı infografik, yazısız.` };
    });
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
