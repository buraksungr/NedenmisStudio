/**
 * BUILD 44 · BUG 2 — iki bağımsız projenin görselleri ASLA paylaşılmamalı.
 *
 * Bu test gerçek üretim yolunu çalıştırır:
 *   proje oluştur → araştır → senaryo üret → sahne üret → görsel üret
 * ve iki farklı konulu projenin görsel varlıklarını karşılaştırır.
 */
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { AppDatabase } from '../../electron/main/infrastructure/database/Database.js';
import { ProjectRepository } from '../../electron/main/infrastructure/database/ProjectRepository.js';
import { MediaRepository } from '../../electron/main/infrastructure/database/MediaRepository.js';
import { ScriptService } from '../../electron/main/services/ai/ScriptService.js';
import { LocalScriptProvider } from '../../electron/main/services/ai/LocalScriptProvider.js';
import { ResearchService } from '../../electron/main/services/research/ResearchService.js';
import { OfflineResearchProvider } from '../../electron/main/services/research/ResearchProviders.js';
import { ProceduralVisualProvider } from '../../electron/main/services/visual/ProceduralVisualProvider.js';
import { VisualService } from '../../electron/main/services/visual/VisualService.js';
import { DEFAULT_IDENTITY } from '../../shared/defaults.js';
import { diagramFor } from '../../shared/visuals/sceneArtwork.js';
import type { Project } from '../../shared/types.js';
import { projectInput } from '../helpers.js';

const directory = await mkdtemp(join(tmpdir(), 'nedenmis-b44-isolation-'));
const OCTOPUS = 'Ahtapotlar nasıl renk değiştirir?';
const POLAR_BEAR = 'Kutup ayılarının derisi neden siyahtır?';

const db = new AppDatabase(join(directory, 'studio.sqlite'));
const projects = new ProjectRepository(db);
const media = new MediaRepository(db);
const llmProviders = new Map([[new LocalScriptProvider().id, new LocalScriptProvider()]]);
const ai = new ScriptService(projects, llmProviders, () => 'local-script', () => DEFAULT_IDENTITY);
const researchProviders = new Map([[new OfflineResearchProvider().id, new OfflineResearchProvider()]]);
const research = new ResearchService(projects, researchProviders, () => 'offline-curated');
const visualProviders = new Map([[new ProceduralVisualProvider().id, new ProceduralVisualProvider()]]);
const visuals = new VisualService(projects, media, visualProviders, () => directory, () => DEFAULT_IDENTITY, () => 'procedural');

async function buildProject(topic: string): Promise<Project> {
  const created = projects.create({ topic, name: topic, category: 'Hayvanlar', mode: 'automatic', targetDuration: 30, narrationStyle: 'belgesel', visualStyle: 'infografik' }, DEFAULT_IDENTITY);
  await research.run(created.id);
  await ai.generate(created.id);
  await ai.generateScenes(created.id);
  return await visuals.generateAll(created.id);
}

afterAll(async () => { db.close(); await rm(directory, { recursive: true, force: true }); });

describe('BUILD 44 · Bug 2 — proje görsel varlıklarının izolasyonu', () => {
  let octopus!: Project;
  let polarBear!: Project;

  beforeAll(async () => {
    octopus = await buildProject(OCTOPUS);
    polarBear = await buildProject(POLAR_BEAR);
  }, 120000);

  it('her iki proje de kendi sahnelerini ve görsellerini üretir', () => {
    expect(octopus.scenes.length).toBeGreaterThan(0);
    expect(polarBear.scenes.length).toBeGreaterThan(0);
    expect(octopus.scenes.every((scene) => scene.status === 'ready' && scene.assetPath)).toBe(true);
    expect(polarBear.scenes.every((scene) => scene.status === 'ready' && scene.assetPath)).toBe(true);
  });

  it('görsel dosya yolları proje kimliğine göre ayrışır', () => {
    const octopusPaths = octopus.scenes.map((scene) => scene.assetPath!);
    const polarPaths = polarBear.scenes.map((scene) => scene.assetPath!);
    expect(octopusPaths.some((path) => path.includes(octopus.id))).toBe(true);
    expect(polarPaths.some((path) => path.includes(polarBear.id))).toBe(true);
    // Hiçbir yol diğer projeye ait olamaz.
    expect(octopusPaths.some((path) => polarPaths.includes(path))).toBe(false);
    expect(polarPaths.some((path) => octopusPaths.includes(path))).toBe(false);
  });

  it('farklı konuların görselleri bayt bayt aynı DEĞİLDİR', async () => {
    const hash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
    const octopusHashes = await Promise.all(octopus.scenes.map((scene) => hash(scene.assetPath!)));
    const polarHashes = await Promise.all(polarBear.scenes.map((scene) => hash(scene.assetPath!)));
    const shared = octopusHashes.filter((value) => polarHashes.includes(value));
    expect(shared).toEqual([]);
    // Aynı konu içinde de her sahne farklı olmalı.
    expect(new Set(octopusHashes).size).toBe(octopusHashes.length);
    expect(new Set(polarHashes).size).toBe(polarHashes.length);
  });

  it('farklı konular YAPISAL olarak farklı görsel kompozisyonlar üretir', async () => {
    // Yalnızca ortalama parlaklık farkı yanıltıcı olabilir; bu yüzden iki
    // ölçüm birlikte kullanılır:
    //   (a) algısal hash (dHash) mesafesi — yapısal fark,
    //   (b) ortalama parlaklık farkı — kompozisyon dağılımı.
    const grid = async (path: string) => {
      const { data } = await sharp(path).greyscale().resize(24, 42, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      return data;
    };
    const dhash = async (path: string) => {
      const { data, info } = await sharp(path).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      let bits = '';
      for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += data[y * info.width + x] > data[y * info.width + x + 1] ? '1' : '0';
      return bits;
    };
    const hamming = (a: string, b: string) => [...a].reduce((sum, bit, index) => sum + (bit !== b[index] ? 1 : 0), 0);

    const count = Math.min(octopus.scenes.length, polarBear.scenes.length);
    for (let index = 0; index < count; index += 1) {
      const a = await grid(octopus.scenes[index].assetPath!);
      const b = await grid(polarBear.scenes[index].assetPath!);
      let sum = 0;
      for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
      expect(sum / a.length).toBeGreaterThan(1.5);
      // Yapısal olarak da farklı olmalı (64 bitlik algısal hash'te en az 6 bit).
      expect(hamming(await dhash(octopus.scenes[index].assetPath!), await dhash(polarBear.scenes[index].assetPath!))).toBeGreaterThan(6);
    }
  });

  it('aynı konu tutarlı bilimsel kompozisyon üretir (deterministik motor)', async () => {
    // Aynı konu → AYNI bilimsel diyagram: kanal kimliği ve tutarlılık korunur.
    // (Hareket katmanı sahne kimliğine göre parçacık konumlandırır; bu yüzden
    //  karşılaştırma diyagram üzerinden yapılır.)
    const again = await buildProject(OCTOPUS);
    const accent = '#D8FF65';
    const first = diagramFor(octopus, octopus.scenes[0], accent);
    const second = diagramFor(again, again.scenes[0], accent);
    expect(second).toBe(first);
    // Farklı konu → farklı diyagram.
    const other = diagramFor(polarBear, polarBear.scenes[0], accent);
    expect(other).not.toBe(first);
  });

  it('proje kopyalandığında eski görsel varlıklar ÜSTÜNLENMEZ', async () => {
    const copy = projects.duplicate(octopus.id);
    expect(copy.id).not.toBe(octopus.id);
    expect(copy.scenes.length).toBe(octopus.scenes.length);
    for (const scene of copy.scenes) {
      expect(scene.assetPath).toBeUndefined();
      expect(scene.narrationPath).toBeUndefined();
      expect(scene.visualProvider).toBeUndefined();
      expect(scene.status).toBe('empty');
    }
    // Kaynak proje kendi görsellerini KORUMALIDIR.
    const source = projects.get(octopus.id);
    expect(source.scenes.every((scene) => scene.assetPath)).toBe(true);
    // Kopya kendi görsellerini üretebilmeli ve KENDİ klasörüne yazmalı.
    const regenerated = await visuals.generateAll(copy.id);
    expect(regenerated.scenes.every((scene) => scene.status === 'ready' && scene.assetPath)).toBe(true);
    expect(regenerated.scenes.every((scene) => scene.assetPath!.includes(copy.id))).toBe(true);
    expect(regenerated.scenes.some((scene) => octopus.scenes.some((original) => original.assetPath === scene.assetPath))).toBe(false);
  });

  it('temsil edilemeyen kavram sessizce yutulmaz, açıkça bildirilir', async () => {
    // Motor hazır bir bilimsel alana eşlenemeyen kavramlarda bunu GİZLEMEZ:
    // sahneye bir görsel notu yazılır ve kullanıcıya gösterilir.
    const project = projects.create(projectInput({ topic: 'Tuhaf bir kavram nasıl işler?', name: 'Tuhaf bir kavram', targetDuration: 20 }));
    await research.run(project.id);
    await ai.generate(project.id);
    await ai.generateScenes(project.id);
    await visuals.generateAll(project.id);
    const scene = projects.get(project.id).scenes[0];
    expect(scene.assetPath).toBeTruthy();
    expect(scene.visualNote).toBeTruthy();
    expect(scene.visualNote).toMatch(/eşlenemedi|doğru temsil/i);
    // Konusu anlaşılır bir proje için NOT üretilmemeli.
    expect(projects.get(octopus.id).scenes.every((item) => !item.visualNote)).toBe(true);
  });

  it('medya kitaplığı kayıtları proje kimliğiyle saklanır', () => {
    const items = media.list('generated-image');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => Boolean(item.projectId))).toBe(true);
    expect(items.some((item) => item.projectId === octopus.id)).toBe(true);
    expect(items.some((item) => item.projectId === polarBear.id)).toBe(true);
  });

  it('proje kapatılıp yeniden açıldığında görsel bağlantıları korunur', () => {
    const reopened = projects.get(octopus.id);
    expect(reopened.scenes.map((scene) => scene.assetPath)).toEqual(octopus.scenes.map((scene) => scene.assetPath));
    expect(reopened.scenes.every((scene) => scene.visualProvider === 'Yerel hareketli infografik')).toBe(true);
  });

  it('bir projenin görselini yeniden üretmek diğer projenin görsellerini etkilemez', async () => {
    const before = await Promise.all(polarBear.scenes.map(async (scene) => createHash('sha256').update(await readFile(scene.assetPath!)).digest('hex')));
    await visuals.regenerate(octopus.id, octopus.scenes[0].id);
    const after = await Promise.all(polarBear.scenes.map(async (scene) => createHash('sha256').update(await readFile(scene.assetPath!)).digest('hex')));
    expect(after).toEqual(before);
  });
});
