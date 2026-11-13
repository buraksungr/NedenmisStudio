// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedScene } from '../../src/renderer/components/AnimatedScene';
import { DEFAULT_IDENTITY } from '../../shared/defaults';
import { createIceAnimationProject } from '../fixtures/iceAnimationProject';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Editör gerçek animasyon önizlemesi', () => {
  it('zaman çizelgesinde arama yapınca aynı bilimsel kareyi gösterir', () => {
    const project = createIceAnimationProject();
    const view = render(<AnimatedScene project={project} scene={project.scenes[0]} identity={DEFAULT_IDENTITY} time={0} playing={false} />);
    const element = view.getByTestId('animated-scene');
    const first = element.innerHTML;
    expect(element.getAttribute('data-animation-preset')).toBe('liquid-molecules');
    view.rerender(<AnimatedScene project={project} scene={project.scenes[0]} identity={DEFAULT_IDENTITY} time={.6} playing={false} />);
    expect(element.getAttribute('data-frame-time')).toBe('0.600');
    expect(element.innerHTML).not.toBe(first);
    expect(element.innerHTML).toContain('data-molecule-id="liquid-0"');
  });

  it('Oynat durumunda requestAnimationFrame ile gerçek nesne karelerini ilerletir', () => {
    const callbacks = new Map<number, FrameRequestCallback>(); let nextId = 1;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { const handle = nextId++; callbacks.set(handle, callback); return handle; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => callbacks.delete(handle)));
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const project = createIceAnimationProject();
    const view = render(<AnimatedScene project={project} scene={project.scenes[3]} identity={DEFAULT_IDENTITY} time={0} playing />);
    const element = view.getByTestId('animated-scene'); const initial = element.innerHTML;
    expect(callbacks.size).toBe(1);
    const callback = callbacks.values().next().value!;
    act(() => callback(100));
    expect(element.getAttribute('data-frame-time')).toBe('0.100');
    expect(element.innerHTML).not.toBe(initial);
    expect(element.getAttribute('data-animation-preset')).toBe('floating-ice');
  });
});
