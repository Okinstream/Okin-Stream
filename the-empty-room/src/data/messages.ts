import type { GameState } from '../state/types';
import { DAY } from '../utils/time';

export interface MessageCtx {
  phase: number;
  visit: number;
  s: GameState;
}

export type Entry =
  | { kind: 'day'; id: string; label: (c: MessageCtx) => string; when: (c: MessageCtx) => boolean }
  | {
      kind: 'msg';
      id: string;
      from: 'them' | 'me' | 'self' | 'system';
      text: string;
      time: (c: MessageCtx) => string;
      when: (c: MessageCtx) => boolean;
      status?: string;
      clue?: string;
      alarm?: boolean;
    };

const fixed = (t: string) => () => t;
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const isToday = (ms: number) => new Date(ms).toDateString() === new Date().toDateString();
const absentLong = (c: MessageCtx) => c.visit >= 2 && c.s.session.absenceMs > DAY;
const longDay = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * La conversation. Jamais complète.
 * Ordre chronologique ; chaque entrée apparaît selon ce que la pièce sait du visiteur.
 */
export const CONVERSATION: Entry[] = [
  { kind: 'day', id: 'd-2025-03-16', label: fixed('16 mars 2025'), when: (c) => c.phase >= 2 },
  {
    kind: 'msg',
    id: 'viendrais',
    from: 'them',
    text: "Tu m'avais dit que tu viendrais.",
    time: fixed('22:03'),
    when: (c) => c.phase >= 2,
  },
  { kind: 'msg', id: 'pas-grave', from: 'them', text: "C'est pas grave.", time: fixed('22:04'), when: (c) => c.phase >= 2 },

  { kind: 'day', id: 'd-2025-03-17', label: fixed('17 mars 2025'), when: () => true },
  { kind: 'msg', id: 'tu-dors', from: 'them', text: 'Tu dors ?', time: fixed('03:17'), when: () => true, clue: 'phone-tu-dors' },
  {
    kind: 'msg',
    id: 'appel',
    from: 'system',
    text: 'Appel manqué',
    time: fixed('03:17'),
    when: (c) => c.phase >= 2,
    alarm: true,
    clue: 'phone-missed-call',
  },
  {
    kind: 'msg',
    id: 'parler',
    from: 'them',
    text: 'Je voulais te parler.',
    time: fixed('03:19'),
    when: (c) => c.phase >= 3 || (c.s.memory.storyFlags.phoneOpens ?? 0) >= 3,
  },
  {
    kind: 'msg',
    id: 'dormais',
    from: 'me',
    text: 'désolé, je dormais',
    time: fixed('09:12'),
    status: 'Non distribué',
    when: (c) => c.phase >= 2,
    clue: 'phone-undelivered',
  },

  { kind: 'day', id: 'd-2025-03-22', label: fixed('22 mars 2025'), when: (c) => c.phase >= 3 },
  { kind: 'msg', id: 'tu-es-la', from: 'self', text: 'Tu es là ?', time: fixed('03:17'), when: (c) => c.phase >= 3, clue: 'phone-22' },

  // ─── ce qui ne devrait pas exister ───────────────────
  {
    kind: 'day',
    id: 'd-ignored',
    label: (c) => longDay(c.s.memory.storyFlags.lastIgnoredCallAt ?? Date.now()),
    when: (c) => !!c.s.memory.storyFlags.lastIgnoredCallAt,
  },
  {
    kind: 'msg',
    id: 'as-tu-vu',
    from: 'them',
    text: "Tu as vu que j'avais appelé ?",
    time: (c) => hm((c.s.memory.storyFlags.lastIgnoredCallAt ?? Date.now()) + 60_000),
    when: (c) => !!c.s.memory.storyFlags.lastIgnoredCallAt,
  },
  {
    kind: 'day',
    id: 'd-today',
    label: fixed("aujourd'hui"),
    when: absentLong,
  },
  {
    kind: 'msg',
    id: 'ca-va',
    from: 'them',
    text: 'Ça va ?',
    time: (c) => hm(c.s.session.startedAt + 20_000),
    when: absentLong,
  },
  {
    kind: 'day',
    id: 'd-tomorrow',
    label: () => longDay(Date.now() + DAY),
    when: (c) => c.phase >= 4 && !c.s.memory.storyFlags.said,
  },
  {
    kind: 'msg',
    id: 'rentres',
    from: 'them',
    text: 'Tu rentres quand ?',
    time: fixed('03:17'),
    when: (c) => c.phase >= 4 && !c.s.memory.storyFlags.said,
    clue: 'phone-future',
  },

  // ─── ce que le visiteur a dit ────────────────────────
  {
    kind: 'day',
    id: 'd-said',
    label: (c) => (isToday(c.s.memory.storyFlags.said ?? 0) ? "aujourd'hui" : longDay(c.s.memory.storyFlags.said ?? 0)),
    // Un seul « aujourd'hui » dans la conversation.
    when: (c) => !!c.s.memory.storyFlags.said && !(isToday(c.s.memory.storyFlags.said) && absentLong(c)),
  },
  {
    kind: 'msg',
    id: 'reste',
    from: 'me',
    text: 'reste.',
    time: (c) => hm(c.s.memory.storyFlags.said ?? Date.now()),
    status: 'Distribué',
    when: (c) => !!c.s.memory.storyFlags.said,
  },
];

/** Qui écrit. Le contact s'efface avec le temps. */
export function contactName(c: MessageCtx): string {
  if (c.s.memory.storyFlags.said) return 'C.';
  if (c.phase >= 4) return '06 ·· ·· 03 17';
  return 'C.';
}
