import { getState, updateMemory, updateSession } from '../state/store';
import type { Memory, ObjectId } from '../state/types';
import { DAY, HOUR, MINUTE } from '../utils/time';

/** Un retour après ce délai est une nouvelle visite. */
const NEW_VISIT_GAP = 10 * MINUTE;
const HEARTBEAT = 5000;

/** La phase avance avec les visites ; une longue nuit peut en valoir deux de plus. */
export function computePhase(visitCount: number, activeMs: number): number {
  const bonus = Math.min(2, Math.floor(activeMs / (20 * MINUTE)));
  return Math.max(1, visitCount + bonus);
}

/** L'objet le plus regardé lors des visites précédentes. */
function mostAttended(attention: Memory['attention']): ObjectId | null {
  let best: ObjectId | null = null;
  let max = 8000;
  for (const [id, ms] of Object.entries(attention) as [ObjectId, number][]) {
    if (ms > max) {
      max = ms;
      best = id;
    }
  }
  return best;
}

/** La plante vit au rythme réel des absences. */
function nextPlant(leaves: number, absenceMs: number, visitCount: number): number {
  if (visitCount < 2) return leaves;
  const days = absenceMs / DAY;
  if (days >= 2) return Math.max(0, leaves - Math.min(3, Math.floor(days) - 1));
  if (days < 1.5) return Math.min(9, leaves + 1);
  return leaves;
}

let started = false;

export function beginSession(now = Date.now()) {
  if (started) return;
  started = true;
  const m = getState().memory;
  const gap = m.lastSeenAt ? now - m.lastSeenAt : Infinity;
  const isNewVisit = gap > NEW_VISIT_GAP;
  const absenceMs = m.lastSeenAt ? gap : 0;
  let visitCount = m.visitCount;

  if (isNewVisit) {
    visitCount += 1;
    const flags = { ...m.storyFlags };
    // Quelqu'un a rallumé la lampe pendant ton absence.
    flags.lampWasLeftOff = !!flags.lampOff;
    flags.lampOff = false;
    updateMemory({
      visitCount,
      visitTimes: [...m.visitTimes, now].slice(-12),
      plantLeaves: nextPlant(m.plantLeaves, absenceMs, visitCount),
      storyFlags: flags,
      lastSeenAt: now,
    });
  }

  if (import.meta.env.DEV) {
    const forced = Number(new URLSearchParams(location.search).get('visite'));
    if (forced > 0) {
      visitCount = forced;
      updateMemory({ visitCount: forced });
    }
  }

  updateSession({
    startedAt: now,
    isNewVisit,
    absenceMs,
    previousVisitTimes: m.visitTimes,
    phase: computePhase(visitCount, 0),
    focus: visitCount > 1 ? mostAttended(m.attention) : null,
    sceneEnteredAt: now,
  });

  startHeartbeat();
}

let heartbeat: number | undefined;

function startHeartbeat() {
  if (heartbeat !== undefined) return;
  heartbeat = window.setInterval(() => {
    if (document.hidden) return;
    const { session, memory, scene } = getState();
    const activeMs = session.activeMs + HEARTBEAT;
    updateMemory({
      timeSpent: memory.timeSpent + HEARTBEAT,
      lastSeenAt: Date.now(),
      voidTime: scene === 'void' ? memory.voidTime + HEARTBEAT : memory.voidTime,
    });
    updateSession({ activeMs, phase: computePhase(memory.visitCount, activeMs) });
  }, HEARTBEAT);
}

export const absenceHours = () => getState().session.absenceMs / HOUR;

export function isEmptied(m: Memory) {
  return m.visitCount >= 9 && !m.storyFlags.said;
}
