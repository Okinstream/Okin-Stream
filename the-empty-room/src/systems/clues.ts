import { CLUES } from '../data/clues';
import { getState, updateMemory, useGame } from '../state/store';
import type { GameState, SceneId } from '../state/types';

export interface ClueContext {
  phase: number;
  visit: number;
  callsIgnored: number;
  said: boolean;
}

export interface ClueDef {
  id: string;
  type: 'visual' | 'text' | 'time' | 'sound' | 'technical';
  location: SceneId | 'phone' | 'photo' | 'source';
  visibility: 'evident' | 'subtle' | 'hidden';
  conditions: (c: ClueContext) => boolean;
  dependencies: string[];
  /** Jamais affiché, retiré du build. */
  meaning?: string;
}

const byId = new Map(CLUES.map((c) => [c.id, c]));

export function clueContext(s: GameState = getState()): ClueContext {
  return {
    phase: s.session.phase,
    visit: s.memory.visitCount,
    callsIgnored: s.memory.storyFlags.callsIgnored ?? 0,
    said: !!s.memory.storyFlags.said,
  };
}

export function isClueAvailable(id: string, s: GameState = getState()): boolean {
  const clue = byId.get(id);
  return !!clue && clue.conditions(clueContext(s));
}

/** Marque un indice comme trouvé. Silencieux : le visiteur n'en sait rien. */
export function discover(id: string) {
  const s = getState();
  if (s.memory.discoveredClues.includes(id) || !isClueAvailable(id, s)) return;
  updateMemory((m) => ({ discoveredClues: [...m.discoveredClues, id] }));
  if (import.meta.env.DEV) console.debug('[indice]', id);
}

export function useDiscovered(id: string) {
  return useGame((s) => s.memory.discoveredClues.includes(id));
}

/** Nombre d'indices dont toutes les dépendances sont aussi trouvées : « compréhension ». */
export function understanding(s: GameState = getState()): number {
  const found = new Set(s.memory.discoveredClues);
  let n = 0;
  for (const id of found) {
    const def = byId.get(id);
    if (def && def.dependencies.every((d) => found.has(d))) n++;
  }
  return n;
}
