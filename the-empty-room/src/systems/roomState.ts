import type { GameState, ObjectId } from '../state/types';
import { DAY, HOUR } from '../utils/time';
import { isEmptied } from './session';

export type CupState = 'none' | 'warm' | 'cold' | 'broken';
export type ClockBase = 'real' | 'stuck' | 'dead';

export interface RoomState {
  /** Vue depuis l'autre chaise : seulement juste après avoir dit le mot. */
  mirrored: boolean;
  after: boolean;
  emptied: boolean;
  chair2Advance: number;
  chair2Opacity: number;
  cup2: CupState;
  rain: boolean;
  windowOpen: boolean;
  doorAjar: boolean;
  /** Jo, Inès, Théo, C. */
  photo: [boolean, boolean, boolean, boolean];
  focus: ObjectId | null;
  plantLeaves: number;
  fallenLeaves: number;
  lampOn: boolean;
  lampRelit: boolean;
  clock: ClockBase;
  loops: number;
}

/**
 * La pièce n'a pas d'état propre : elle est entièrement déduite de ce que
 * la mémoire sait du visiteur. Deux visiteurs identiques verraient la même pièce.
 */
export function deriveRoom(s: GameState): RoomState {
  const { memory: m, session } = s;
  const f = m.storyFlags;
  const visit = Math.max(1, m.visitCount);
  const after = !!f.said;
  const emptied = isEmptied(m);
  const phase = session.phase;

  let cup2: CupState;
  if (after) cup2 = 'warm';
  else if (emptied) cup2 = 'none';
  else if (visit === 1) cup2 = session.phoneOpenedHere ? 'warm' : 'none';
  else if (session.absenceMs > 7 * DAY) cup2 = 'none';
  else if (f.lastIgnoredCallAt && f.lastIgnoredCallAt < session.startedAt && session.startedAt - f.lastIgnoredCallAt < 7 * DAY)
    cup2 = 'broken';
  else cup2 = session.absenceMs < 3 * HOUR ? 'warm' : 'cold';

  return {
    mirrored: session.justSaid,
    after,
    emptied,
    chair2Advance: after ? 0 : Math.min(visit - 1, 24) * 7,
    chair2Opacity: after ? 1 : emptied ? 0 : Math.min(0.3, 0.14 + visit * 0.015),
    cup2,
    rain: !after && (phase >= 2 || session.phoneOpenedHere),
    windowOpen: after,
    doorAjar: after || phase >= 2 || session.phoneOpenedHere,
    photo: after ? [true, true, true, true] : [visit < 2, visit < 3, visit < 4, !emptied],
    focus: session.focus,
    plantLeaves: m.plantLeaves,
    fallenLeaves: Math.max(0, Math.min(5, 7 - m.plantLeaves)),
    lampOn: !f.lampOff,
    lampRelit: !!f.lampWasLeftOff && session.isNewVisit,
    clock: after ? 'real' : emptied ? 'dead' : phase >= 2 ? 'stuck' : 'real',
    loops: session.loops,
  };
}
