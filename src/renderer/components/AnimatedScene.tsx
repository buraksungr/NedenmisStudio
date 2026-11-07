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
  className?: string;
}

/** The browser and the exporter deliberately call the same pure SVG timeline. */
export function AnimatedScene({ project, scene, identity, time, playing, className = '' }: Props) {
  const [localTime, setLocalTime] = useState(time);
  const displayedRef = useRef(time);
  const externalTime = useRef(time);
  externalTime.current = time;
  displayedRef.current = localTime;
  const settings = resolveAnimation(project, scene);

  useEffect(() => {
    if (!playing || Math.abs(displayedRef.current - time) > .2) {
      displayedRef.current = time;
      setLocalTime(time);
    }
  }, [time, playing, scene.id]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const origin = performance.now() - externalTime.current * 1000;
    let previous = -1;
    const tick = (now: number) => {
      const next = Math.min(scene.duration, Math.max(0, (now - origin) / 1000));
      const quantized = Math.floor(next * 30) / 30;
      if (quantized !== previous) {
        previous = quantized;
        displayedRef.current = quantized;
        setLocalTime(quantized);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, scene.id, scene.duration]);

  const frameTime = Math.floor(Math.max(0, Math.min(scene.duration, localTime)) * 30) / 30;
  const svg = useMemo(() => renderAnimatedSceneSvg(project, scene, { ...DEFAULT_IDENTITY, ...identity }, frameTime), [project, scene, identity, frameTime]);
  return <div
    className={`absolute inset-0 h-full w-full overflow-hidden ${className}`}
    data-testid="animated-scene"
    data-animation-preset={settings.preset}
    data-frame-time={frameTime.toFixed(3)}
    role="img"
    aria-label={`Sahne ${scene.number}: ${settings.preset} hareketli bilimsel infografik`}
    dangerouslySetInnerHTML={{ __html: svg }}
  />;
}
