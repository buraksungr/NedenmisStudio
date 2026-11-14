import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelIdentity, Project, Scene } from '@shared/types';
import { DEFAULT_IDENTITY } from '@shared/defaults';
import { renderAnimatedSceneSvg, resolveAnimation } from '@shared/visuals/sceneAnimation';

interface Props {
  project: Project;
  scene: Scene;
  identity: ChannelIdentity;
  time: number;
  playing: boolean;
  /**
   * `timelineDriven` editör önizlemesidir: kare zamanı dışarıdaki tek oynatma
   * saatinden gelir, bileşen kendi saatini çalıştırmaz. Böylece animasyon,
   * altyazı, ses ve oynatma başlığı asla birbirinden kaymaz.
   */
  timelineDriven?: boolean;
  /** Geçiş sırasında sönmekte olan katman ayrı bir kimlikle işaretlenir. */
  testId?: string;
  className?: string;
}

/** Tarayıcı önizlemesi ve dışa aktarıcı bilinçli olarak aynı saf SVG zaman çizelgesini çağırır. */
export function AnimatedScene({ project, scene, identity, time, playing, timelineDriven = false, testId = 'animated-scene', className = '' }: Props) {
  const externalTime = useRef(time); externalTime.current = time;
  // Kare zamanı dış saatten doğrudan türetilir; ayrıca kopyalanmış bir state
  // tutulmaz. Böylece arama (seek) her zaman tek karede yansır ve sahne
  // değişiminde eski kare asla görünmez.
  const [selfTime, setSelfTime] = useState<number>();
  const settings = resolveAnimation(project, scene);

  // Yalnızca tek başına kullanıldığında (dış saat yokken) kendi kare saatini
  // çalıştırır; editörde oynatma saati sahibi her zaman Editor'dür.
  const drivesItself = playing && !timelineDriven;
  useEffect(() => {
    if (!drivesItself) return;
    let frame = 0;
    const origin = performance.now() - externalTime.current * 1000;
    let previous = -1;
    const tick = (now: number) => {
      const next = Math.min(scene.duration, Math.max(0, (now - origin) / 1000));
      const quantized = Math.floor(next * 30) / 30;
      if (quantized !== previous) { previous = quantized; setSelfTime(quantized); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drivesItself, scene.id, scene.duration]);

  // Dış saatten gelen değer her karede tek doğruluk kaynağıdır.
  const sourceTime = drivesItself && selfTime !== undefined ? selfTime : time;
  const frameTime = Math.floor(Math.max(0, Math.min(scene.duration, sourceTime)) * 30) / 30;
  const svg = useMemo(() => renderAnimatedSceneSvg(project, scene, { ...DEFAULT_IDENTITY, ...identity }, frameTime), [project, scene, identity, frameTime]);
  // SVG `width`/`height` NİTELİKLERİ 1080×1920'dir; Tailwind preflight ise
  // yalnızca `img, video` için `max-width:100%` verir, `svg` için VERMEZ. Bu yüzden
  // satır içi SVG kendi 1080×1920 boyutunda kalıp önizleme kutusunu taşırıyor ve
  // kırpılıyordu. Ölçüm (gerçek Chromium, 1440×900): kutu 384,75×684 px, SVG
  // 1080×1920 px → kompozisyonun yalnızca %12,69'u görünüyordu.
  // Çözüm: SVG kapsayıcısına sığdırılır (contain). `viewBox` 0 0 1080 1920
  // olduğu için koordinat uzayı ve kompozisyon dışa aktarımla AYNI kalır;
  // değişen tek şey görüntüleme ölçeğidir.
  return <div
    className={`scene-fit absolute inset-0 h-full w-full overflow-hidden ${className}`}
    data-testid={testId}
    data-animation-preset={settings.preset}
    data-frame-time={frameTime.toFixed(3)}
    role="img"
    aria-label={`Sahne ${scene.number}: ${settings.preset} hareketli bilimsel infografik`}
    dangerouslySetInnerHTML={{ __html: svg }}
  />;
}
