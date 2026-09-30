import { useEffect } from 'react';
import { getState, updateSession } from '../state/store';

const TITLE = 'the empty room';
const IDLE_AFTER = 20_000;

/**
 * Immobilité et absence.
 * Quand l'onglet est caché, la page appelle. Quand on ne bouge plus, quelqu'un apparaît.
 */
export function usePresence() {
  useEffect(() => {
    let timer = window.setTimeout(() => updateSession({ idle: true }), IDLE_AFTER);

    const wake = () => {
      if (getState().session.idle) updateSession({ idle: false });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => updateSession({ idle: true }), IDLE_AFTER);
    };

    const visibility = () => {
      const said = !!getState().memory.storyFlags.said;
      document.title = document.hidden ? (said ? 'reste.' : 'tu es là ?') : TITLE;
    };

    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake));
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
}
