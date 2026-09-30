import { useSyncExternalStore } from 'react';
import { prefersReducedMotion } from '../utils/dom';
import type { GameState, Memory, Session } from './types';

const STORAGE_KEY = 'salle.03:17';

export function freshMemory(now = Date.now()): Memory {
  return {
    v: 1,
    visitCount: 0,
    firstVisitAt: now,
    lastSeenAt: 0,
    visitTimes: [],
    timeSpent: 0,
    visitedScenes: {},
    discoveredClues: [],
    objectsInteracted: {},
    attention: {},
    voidRevealed: [],
    voidTime: 0,
    plantLeaves: 7,
    storyFlags: {},
    settings: { volume: 0.7, muted: false, reducedMotion: prefersReducedMotion(), quality: 'auto' },
  };
}

function freshSession(now = Date.now()): Session {
  return {
    startedAt: now,
    isNewVisit: true,
    absenceMs: 0,
    previousVisitTimes: [],
    activeMs: 0,
    phase: 1,
    focus: null,
    sceneEnteredAt: now,
    introDone: false,
    overlay: null,
    phoneOpenedHere: false,
    call: 'none',
    notification: null,
    clockRunning: false,
    idle: false,
    audioAwake: false,
    justSaid: false,
    loops: 0,
    transition: null,
  };
}

function load(): Memory {
  try {
    if (new URLSearchParams(location.search).has('oublier')) {
      localStorage.removeItem(STORAGE_KEY);
      history.replaceState(null, '', location.pathname);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshMemory();
    const parsed = JSON.parse(raw) as Partial<Memory>;
    if (parsed.v !== 1) return freshMemory();
    const base = freshMemory();
    return {
      ...base,
      ...parsed,
      storyFlags: { ...parsed.storyFlags },
      settings: { ...base.settings, ...parsed.settings },
    } as Memory;
  } catch {
    return freshMemory();
  }
}

let state: GameState = { memory: load(), session: freshSession(), scene: 'room' };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const getState = () => state;

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setScene(scene: GameState['scene']) {
  state = { ...state, scene };
  emit();
}

export function updateMemory(recipe: Partial<Memory> | ((m: Memory) => Partial<Memory>)) {
  const patch = typeof recipe === 'function' ? recipe(state.memory) : recipe;
  state = { ...state, memory: { ...state.memory, ...patch } };
  scheduleSave();
  emit();
}

export function updateFlags(recipe: (f: Memory['storyFlags']) => Memory['storyFlags']) {
  updateMemory((m) => ({ storyFlags: { ...m.storyFlags, ...recipe(m.storyFlags) } }));
}

export function updateSession(recipe: Partial<Session> | ((s: Session) => Partial<Session>)) {
  const patch = typeof recipe === 'function' ? recipe(state.session) : recipe;
  let changed = false;
  for (const k in patch) {
    if (patch[k as keyof Session] !== state.session[k as keyof Session]) changed = true;
  }
  if (!changed) return;
  state = { ...state, session: { ...state.session, ...patch } };
  emit();
}

/** Sélecteur React. Le sélecteur doit renvoyer une primitive ou une référence existante. */
export function useGame<T>(selector: (s: GameState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

// ─── persistance ─────────────────────────────────────────────

let saveTimer: number | undefined;

function scheduleSave() {
  if (saveTimer !== undefined) return;
  saveTimer = window.setTimeout(saveNow, 1500);
}

export function saveNow() {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.memory));
  } catch {
    /* navigation privée : la pièce oubliera, c'est tout. */
  }
}

window.addEventListener('pagehide', saveNow);
