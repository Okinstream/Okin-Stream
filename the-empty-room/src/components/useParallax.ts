import { useEffect, type RefObject } from 'react';
import { getState } from '../state/store';
import { isTouch } from '../utils/dom';

/**
 * Parallaxe de quelques pixels. Écrit directement des variables CSS :
 * aucun rendu React, et la boucle s'arrête dès que tout est immobile.
 */
export function useParallax(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || isTouch()) return;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;

    const step = () => {
      x += (tx - x) * 0.035;
      y += (ty - y) * 0.035;
      el.style.setProperty('--px', x.toFixed(4));
      el.style.setProperty('--py', y.toFixed(4));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(step) : 0;
    };

    const move = (e: PointerEvent) => {
      if (getState().memory.settings.reducedMotion) return;
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(step);
    };

    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
}
