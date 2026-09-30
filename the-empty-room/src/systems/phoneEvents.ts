import { useEffect } from 'react';
import { audio } from '../audio/engine';
import { getState, updateFlags, updateSession } from '../state/store';
import { isMirrorMinute } from '../utils/time';
import { deriveRoom } from './roomState';

/**
 * Le téléphone vit sa vie. Horloge interne : secondes passées dans la pièce
 * pendant cette visite (conservées d'une entrée à l'autre).
 */
let roomSeconds = 0;
let fired = new Set<string>();
let ringTimer: number | undefined;

const RING_SECONDS = 17;
const CALL_AT = 197; // 3 min 17 s

function notify(text: string) {
  updateSession({ notification: text });
  audio.play('buzz', { pan: -0.1 });
}

function ring() {
  updateSession({ call: 'ringing', notification: null });
  let elapsed = 0;
  audio.play('buzz', { pan: -0.1 });
  ringTimer = window.setInterval(() => {
    elapsed += 1;
    if (getState().session.call !== 'ringing') {
      window.clearInterval(ringTimer);
      return;
    }
    if (elapsed % 2 === 0) audio.play('buzz', { pan: -0.1 });
    if (elapsed >= RING_SECONDS) {
      window.clearInterval(ringTimer);
      // Personne n'a répondu. La pièce s'en souviendra.
      updateSession({ call: 'missed', notification: 'Appel manqué' });
      updateFlags((f) => ({ callsIgnored: (f.callsIgnored ?? 0) + 1, lastIgnoredCallAt: Date.now() }));
    }
  }, 1000);
}

export function answerCall() {
  window.clearInterval(ringTimer);
  updateSession({ call: 'answered' });
  updateFlags((f) => ({ callsAnswered: (f.callsAnswered ?? 0) + 1 }));
}

function once(id: string, fn: () => void) {
  if (fired.has(id)) return;
  fired.add(id);
  fn();
}

export function usePhoneEvents() {
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const s = getState();
      if (s.session.transition || !s.session.introDone) return;
      roomSeconds += 1;
      const room = deriveRoom(s);
      if (room.emptied) return;
      const visit = s.memory.visitCount;
      const opened = s.memory.storyFlags.phoneOpens ?? 0;

      if (isMirrorMinute()) once('mirror', () => notify('Tu es là ?'));
      if (room.after) return;

      if (visit <= 1 && opened === 0 && roomSeconds >= 40) once('first', () => notify('Tu dors ?'));
      if (visit >= 2 && s.session.absenceMs > 86_400_000 && roomSeconds >= 20) once('absent', () => notify('Ça va ?'));
      if (s.session.phase >= 2 && roomSeconds >= CALL_AT && s.session.overlay === null) once('call', ring);
      // Rappel discret tant que le téléphone attend.
      if (s.session.notification && roomSeconds % 61 === 0) audio.play('buzz', { pan: -0.1, level: 0.5 });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
}

/** Pour les tests manuels uniquement. */
export function resetPhoneEvents() {
  roomSeconds = 0;
  fired = new Set();
}
