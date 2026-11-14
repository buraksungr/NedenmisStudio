import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { FileVideo2 } from 'lucide-react';
import type { ChannelIdentity, Project, Scene, SubtitleCue } from '@shared/types';
import { AnimatedScene } from './AnimatedScene';
import { Button } from './ui';

interface Props {
  project: Project;
  identity: ChannelIdentity;
  scene?: Scene;
  /** Geçiş penceresinde sönmekte olan sahne. */
  outgoingScene?: Scene;
  transitionKind?: Scene['transition'];
  transitionProgress: number;
  /** İlk sahnenin açılış soluklaşması (dışa aktarımla aynı eğri). */
  openingOpacity: number;
  /** Geçerli sahnenin kendi başlangıcına göre yerel zamanı. */
  localTime: number;
  outgoingLocalTime?: number;
  playing: boolean;
  activeCue?: SubtitleCue;
  mediaError?: string;
  onGenerateVisual?(): void;
}

/** Altyazı vurgusu: dışa aktarılan ASS dosyasıyla aynı kelimeyi renklendirir. */
export function highlighted(cue: SubtitleCue, uppercase: boolean, color: string): ReactNode {
  const text = uppercase ? cue.text.toLocaleUpperCase('tr-TR') : cue.text; if (!cue.emphasis?.length) return text;
  const emphasis = uppercase ? cue.emphasis[0].toLocaleUpperCase('tr-TR') : cue.emphasis[0]; const index = text.toLocaleLowerCase('tr-TR').indexOf(emphasis.toLocaleLowerCase('tr-TR')); if (index < 0) return text;
  return <>{text.slice(0, index)}<span style={{ color, fontWeight: 700 }}>{text.slice(index, index + emphasis.length)}</span>{text.slice(index + emphasis.length)}</>;
}

function cameraTransform(scene: Scene, localTime: number): string {
  const duration = Math.max(.001, scene.duration);
  const progress = Math.max(0, Math.min(1, localTime / duration));
  const zoom = scene.cameraMovement === 'zoom-in' ? 1 + progress * .07 : scene.cameraMovement === 'zoom-out' ? 1.07 - progress * .07 : 1;
  const pan = scene.cameraMovement === 'pan-left' ? -2 + progress * 4 : scene.cameraMovement === 'pan-right' ? 2 - progress * 4 : 0;
  return `scale(${zoom.toFixed(4)}) translateX(${pan.toFixed(3)}%)`;
}

function SceneLayer({ project, scene, identity, localTime, playing, style, outgoing = false }: { project: Project; scene: Scene; identity: ChannelIdentity; localTime: number; playing: boolean; style?: React.CSSProperties; outgoing?: boolean }) {
  const procedural = scene.assetType === 'procedural' && scene.animation?.enabled !== false;
  return <div className="absolute inset-0" style={style} data-preview-scene={scene.number} data-preview-scene-id={scene.id}>
    {procedural
      ? <AnimatedScene key={scene.id} project={project} scene={scene} identity={identity} time={localTime} playing={playing} timelineDriven testId={outgoing ? 'animated-scene-outgoing' : 'animated-scene'} />
      : scene.assetPath
        ? <img src={window.nedenmis.system.mediaUrl(scene.assetPath)} className="absolute inset-0 h-full w-full object-cover" style={{ transform: cameraTransform(scene, localTime), transformOrigin: '50% 50%' }} alt="" />
        : null}
  </div>;
}

/**
 * Editör önizleme sahnesi. Oynatma başlığı hangi sahneyi gösteriyorsa onu,
 * geçiş penceresinde ise iki sahnenin karışımını çizer. Dışa aktarımda kullanılan
 * xfade penceresiyle aynı zaman aralığı (`CROSSFADE_SECONDS`) kullanılır.
 */
export function PreviewStage({ project, identity, scene, outgoingScene, transitionKind = 'fade', transitionProgress, openingOpacity, localTime, outgoingLocalTime = 0, playing, activeCue, mediaError, onGenerateVisual }: Props): ReactNode {
  const empty = scene && !scene.assetPath && (scene.assetType !== 'procedural' || scene.animation?.enabled === false);
  const sliding = transitionKind === 'slide';
  return <div className="absolute inset-0 overflow-hidden" data-testid="preview-stage" data-current-scene={scene?.number ?? ''} data-transition-progress={transitionProgress.toFixed(3)} style={{ opacity: openingOpacity }}>
    {outgoingScene && <SceneLayer project={project} scene={outgoingScene} identity={identity} localTime={outgoingLocalTime} playing={playing} outgoing />}
    {scene && <SceneLayer
      project={project}
      scene={scene}
      identity={identity}
      localTime={localTime}
      playing={playing}
      style={outgoingScene ? { opacity: sliding ? 1 : transitionProgress, transform: sliding ? `translateX(${(1 - transitionProgress) * 100}%)` : undefined } : undefined}
    />}
    <div className="preview-vignette pointer-events-none absolute inset-0" data-testid="preview-atmosphere" />
    {mediaError && <div role="alert" className="absolute inset-x-4 top-4 z-10 rounded-lg border border-red-400/30 bg-[#351a1a]/95 p-3 text-[10px] leading-4 text-red-100">{mediaError}. Medya kitaplığından dosyayı yeniden seçin veya görseli yeniden üretin.</div>}
    {empty && <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center"><FileVideo2 size={28} className="mb-3 text-[#617067]" /><p className="text-[10px] leading-5 text-[#8b9990]">Bu sahne için henüz görsel yok.</p>{scene && onGenerateVisual && <Button className="mt-4 px-3 py-2 text-[10px]" onClick={onGenerateVisual}>Prosedürel görsel üret</Button>}</div>}
    {activeCue && !outgoingScene && <motion.div key={activeCue.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`absolute left-[7%] right-[7%] text-center font-semibold leading-[1.3] ${project.subtitleStyle.position === 'top' ? 'top-[10%]' : project.subtitleStyle.position === 'center' ? 'top-[45%]' : 'bottom-[11%]'}`} style={{ color: project.subtitleStyle.color, fontFamily: project.subtitleStyle.fontFamily, fontSize: `${Math.max(9, project.subtitleStyle.fontSize / 4.3)}px`, textShadow: `0 1px ${project.subtitleStyle.outlineWidth}px ${project.subtitleStyle.outlineColor}, 0 0 4px #000`, backgroundColor: `${project.subtitleStyle.backgroundColor}${Math.round(project.subtitleStyle.backgroundOpacity * 255).toString(16).padStart(2, '0')}`, padding: '.25em .4em', borderRadius: '.25em' }} data-testid="preview-subtitle">{highlighted(activeCue, project.subtitleStyle.uppercase, project.subtitleStyle.highlightColor)}</motion.div>}
  </div>;
}
