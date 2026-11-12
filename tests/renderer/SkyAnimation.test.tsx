// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedScene } from '../../src/renderer/components/AnimatedScene';
import { DEFAULT_IDENTITY } from '../../shared/defaults';
import { createSkyAnimationProject } from '../fixtures/skyAnimationProject';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Gökyüzü editör önizlemesi ve dışa aktarım ortak zaman çizelgesi', () => {
  it('kanca, açıklama ve sonucun her birinde gerçek foton hareketini oynatır ve arar', () => {
    const callbacks = new Map<number, FrameRequestCallback>(); let nextId = 1;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { const handle = nextId++; callbacks.set(handle, callback); return handle; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => callbacks.delete(handle)));
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const project = createSkyAnimationProject();
    project.scenes.forEach((scene, index) => {
      const view = render(<AnimatedScene project={project} scene={scene} identity={DEFAULT_IDENTITY} time={0} playing />);
      const preview = view.getByTestId('animated-scene');
      expect(preview.getAttribute('data-animation-preset')).toBe('light-scattering');
      expect(preview.getAttribute('aria-label')).toContain(`Sahne ${index + 1}`);
      const initial = preview.innerHTML;
      const handle = [...callbacks.keys()].at(-1)!; const callback = callbacks.get(handle)!; callbacks.delete(handle);
      act(() => callback(100 + index * 10));
      expect(Number(preview.getAttribute('data-frame-time'))).toBeGreaterThan(0);
      expect(preview.innerHTML).not.toBe(initial);
      expect(preview.innerHTML).toContain('data-light-photon=');
      view.rerender(<AnimatedScene project={project} scene={scene} identity={DEFAULT_IDENTITY} time={1.5} playing={false} />);
      expect(preview.getAttribute('data-frame-time')).toBe('1.500');
      expect(preview.innerHTML).toContain('data-scattered-photon=');
      view.unmount();
    });
    expect(callbacks.size).toBe(0);
  });
});
