import type { GameState, ObjectId } from '../state/types';
import { hhmm } from '../utils/time';

export type Shape = ObjectId | 'figure' | 'light';

export interface VoidItem {
  id: string;
  /** Position en % de l'écran. */
  x: number;
  y: number;
  /** Texte, ou fonction si le texte dépend du visiteur. */
  text?: string | ((s: GameState) => string);
  shape?: Shape | ((s: GameState) => Shape | null);
  size?: number;
  /** Combien de temps il faut rester immobile pour que ça apparaisse. */
  stillness: number;
  when: (s: GameState) => boolean;
  clue?: string;
  serif?: boolean;
}

const phase = (s: GameState) => s.session.phase;
const visit = (s: GameState) => s.memory.visitCount;

function topAttention(s: GameState): ObjectId | null {
  let best: ObjectId | null = null;
  let max = 5000;
  for (const [id, ms] of Object.entries(s.memory.attention) as [ObjectId, number][]) {
    if (ms > max) {
      max = ms;
      best = id;
    }
  }
  return best;
}

/**
 * Le vide. Plus on y reste, plus on voit qu'il était plein.
 * Ce qui a été vu une fois reste visible, faiblement, pour toujours.
 */
export const VOID_ITEMS: VoidItem[] = [
  { id: 'la', x: 50, y: 30, text: 'tu es là ?', stillness: 0, when: () => true, serif: true },
  { id: 'chair', x: 22, y: 66, shape: 'chair', size: 5, stillness: 400, when: () => true },
  {
    id: 'chair-2',
    x: 29,
    y: 66,
    shape: 'chair2',
    size: 5,
    stillness: 1600,
    when: (s) => (s.memory.storyFlags.emptyChairTouches ?? 0) > 0 || !!s.memory.storyFlags.said,
  },
  { id: 'date', x: 80, y: 20, text: '17.03', stillness: 900, when: () => true },
  {
    id: 'times',
    x: 76,
    y: 74,
    text: (s) =>
      s.memory.visitTimes
        .slice(0, -1)
        .map((t) => hhmm(new Date(t)))
        .join('  ·  ') || '—',
    stillness: 1500,
    when: (s) => visit(s) >= 2,
    clue: 'void-times',
  },
  { id: 'photo', x: 36, y: 20, shape: 'photo', size: 6, stillness: 1500, when: (s) => phase(s) >= 2 },
  { id: 'photo-date', x: 36, y: 28.5, text: '17.03.25', size: 0.8, stillness: 2400, when: (s) => phase(s) >= 2 },
  { id: 'dire', x: 14, y: 40, text: 'je voulais te dire', stillness: 800, when: (s) => phase(s) >= 2, serif: true },
  {
    id: 'phrase',
    x: 52,
    y: 56,
    text: 'après toi, les chaises sont restées là.',
    stillness: 3170,
    when: (s) => phase(s) >= 2,
    clue: 'void-sentence',
    serif: true,
  },
  { id: 'reviendra', x: 62, y: 86, text: 'on reviendra tous les ans.', stillness: 1200, when: (s) => visit(s) >= 2, serif: true },
  { id: 'su', x: 84, y: 46, text: "je n'ai jamais su le dire.", stillness: 2000, when: (s) => phase(s) >= 3, clue: 'void-say', serif: true },
  { id: 'y24', x: 7, y: 11, text: '2024', size: 0.8, stillness: 500, when: () => true },
  { id: 'y25', x: 93, y: 90, text: '2025', size: 0.8, stillness: 500, when: () => true },
  { id: 'appel', x: 68, y: 11, text: '03:17 — appel manqué', size: 0.8, stillness: 1000, when: (s) => phase(s) >= 2 },
  { id: 'noms', x: 12, y: 86, text: 'Jo · Inès · Théo', size: 0.8, stillness: 2600, when: (s) => phase(s) >= 3 },
  {
    id: 'regard',
    x: 60,
    y: 38,
    shape: (s) => topAttention(s),
    size: 4,
    stillness: 1200,
    when: (s) => topAttention(s) !== null,
  },
  { id: 'lumiere', x: 42, y: 78, shape: 'light', size: 3, stillness: 2000, when: (s) => s.memory.voidTime > 120_000 },
  { id: 'silhouette', x: 90, y: 64, shape: 'figure', size: 9, stillness: 5000, when: (s) => phase(s) >= 3 },
  { id: 'encore', x: 50, y: 44, text: 'tu es encore là.', stillness: 1700, when: (s) => !!s.memory.storyFlags.said, serif: true },
];
