import { writeFile } from 'node:fs/promises';
import type { ChannelIdentity, ConnectionTestResult, Project, Scene } from '../../../../shared/types.js';
import type { CredentialStore } from '../../infrastructure/CredentialStore.js';
import type { VisualProvider } from './VisualProvider.js';

export class OpenAiImageProvider implements VisualProvider {
  readonly id = 'openai-images'; readonly name = 'OpenAI Görsel Üretimi';
  constructor(private readonly credentials: CredentialStore) {}
  async generate(project: Project, scene: Scene, identity: ChannelIdentity, outputPath: string): Promise<void> {
    const key = this.credentials.get(this.id); if (!key) throw new Error('OpenAI görsel API anahtarı eksik. Ayarlar bölümünden ekleyin veya prosedürel motoru seçin.');
    const response = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000), body: JSON.stringify({ model: 'gpt-image-1', prompt: `${scene.visualPrompt || scene.visualDescription}. ${project.visualStyle} stilinde, 9:16 dikey kompozisyon. Kanal vurgu rengi ${identity.primaryColor}. Bilimsel olarak sahne anlatımıyla doğrudan ilişkili. Görselde yazı, logo veya altyazı olmasın.`, size: '1024x1536', n: 1 }) });
    const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || `Görsel üretimi başarısız (${response.status}).`);
    const item = data.data?.[0];
    if (item?.b64_json) { await writeFile(outputPath, Buffer.from(item.b64_json, 'base64')); return; }
    if (item?.url) { const image = await fetch(item.url, { signal: AbortSignal.timeout(60000) }); if (!image.ok) throw new Error('Üretilen görsel indirilemedi.'); await writeFile(outputPath, Buffer.from(await image.arrayBuffer())); return; }
    throw new Error('Görsel sağlayıcısı kullanılabilir veri döndürmedi.');
  }
  async test(): Promise<ConnectionTestResult> { return this.credentials.has(this.id) ? { ok: true, message: 'API anahtarı kayıtlı. Ücret doğuracağı için testte görsel üretilmedi; ilk sahne üretimi gerçek bağlantıyı doğrular.' } : { ok: false, message: 'OpenAI görsel API anahtarı eksik.' }; }
}
