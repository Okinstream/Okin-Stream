import { audio } from '../audio/engine';
import { go } from '../systems/sceneEngine';
import { getState, saveNow, updateFlags, updateSession } from '../state/store';
import { setFavicon } from '../utils/dom';
import { fnv1a } from '../utils/hash';

/** Le mot n'est jamais écrit ici. */
const KEY = 0xe251c096;
const LENGTH = 5;

export function normalizeLetter(key: string): string | null {
  if (key.length !== 1) return null;
  const base = key.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return /^[A-Z]$/.test(base) ? base : null;
}

export function matches(buffer: string): boolean {
  return buffer.length >= LENGTH && fnv1a(buffer.slice(-LENGTH)) === KEY;
}

/** Ce qui arrive quand on le dit enfin. */
export function speak(onBloom: () => void) {
  if (getState().memory.storyFlags.said) {
    onBloom();
    window.setTimeout(() => go('room', { tone: 'white', out: 3200, in: 5200 }), 4000);
    return;
  }
  updateFlags(() => ({ said: Date.now() }));
  updateSession({ justSaid: true });
  saveNow();
  audio.play('bloom');
  onBloom();
  setFavicon('/chaise-2.svg');
  window.setTimeout(() => go('room', { tone: 'white', out: 4200, in: 6400 }), 6200);
  console.log('%creste.', 'color:#c9a45c;font:italic 15px Georgia,serif');
}
