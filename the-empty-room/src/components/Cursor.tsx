import { useEffect, useRef } from 'react';
import { getState } from '../state/store';
import { isTouch } from '../utils/dom';

/**
 * Un curseur qui respire et traîne un peu.
 * object : réagit. pseudo : semble réagir. none : rien.
 */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || isTouch()) return;
    document.documentElement.classList.add('custom-cursor');
    let tx = -100;
    let ty = -100;
    let x = -100;
    let y = -100;
    let raf = 0;
    let mode = '';

    const step = () => {
      const k = getState().memory.settings.reducedMotion ? 1 : 0.2;
      x += (tx - x) * k;
      y += (ty - y) * k;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(step) : 0;
    };

    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const target = (e.target as Element | null)?.closest?.('[data-cursor]');
      const next = target?.getAttribute('data-cursor') ?? '';
      if (next !== mode) {
        mode = next;
        el.dataset.mode = mode;
      }
      if (!raf) raf = requestAnimationFrame(step);
    };
    const leave = () => (el.dataset.hidden = 'true');
    const enter = () => delete el.dataset.hidden;

    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    document.addEventListener('pointerenter', enter);
    return () => {
      document.documentElement.classList.remove('custom-cursor');
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      document.removeEventListener('pointerenter', enter);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="cursor" aria-hidden />;
}
