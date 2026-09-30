import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { LayerId } from '../audio/engine';
import { audio } from '../audio/engine';
import { getState, setScene, updateMemory, updateSession } from '../state/store';
import type { GameState, SceneId, Transition } from '../state/types';

export interface Atmosphere {
  /** Poussière en suspension (canvas). */
  dust: number;
  grain: number;
  vignette: number;
  fog: number;
}

export interface SceneDef {
  id: SceneId;
  component: LazyExoticComponent<ComponentType>;
  atmosphere: Atmosphere;
  /** Mix audio voulu pour cette scène, recalculé quand l'état change. */
  audio: (s: GameState) => Partial<Record<LayerId, number>>;
  audioMode: 'ballad' | 'void';
  /** Peut-on y entrer maintenant ? */
  conditions?: (s: GameState) => boolean;
  onEnter?: (s: GameState) => void;
}

const registry = new Map<SceneId, SceneDef>();

export function defineScene(def: Omit<SceneDef, 'component'> & { load: () => Promise<{ default: ComponentType }> }) {
  const { load, ...rest } = def;
  registry.set(def.id, { ...rest, component: lazy(load) });
}

export const getScene = (id: SceneId) => {
  const def = registry.get(id);
  if (!def) throw new Error(`scène inconnue : ${id}`);
  return def;
};

/** Précharge une scène (les imports dynamiques sont mis en cache par le bundler). */
export function prefetch(load: () => Promise<unknown>) {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
  idle(() => void load());
}

let busy = false;

/**
 * Change de scène lentement : fondu sortant, bascule, fondu entrant.
 * Aucune coupe franche dans ce site.
 */
export function go(to: SceneId, opts: { out?: number; in?: number; tone?: Transition['tone'] } = {}) {
  if (busy) return;
  const def = getScene(to);
  const s = getState();
  if (def.conditions && !def.conditions(s)) return;
  busy = true;
  const out = opts.out ?? 1800;
  const inn = opts.in ?? 2600;
  const tone = opts.tone ?? 'black';
  updateSession({ transition: { to, stage: 'out', tone, ms: out }, overlay: null });

  window.setTimeout(() => {
    setScene(to);
    updateMemory((m) => ({ visitedScenes: { ...m.visitedScenes, [to]: (m.visitedScenes[to] ?? 0) + 1 } }));
    updateSession({ sceneEnteredAt: Date.now(), transition: { to, stage: 'in', tone, ms: inn } });
    audio.setMode(def.audioMode);
    def.onEnter?.(getState());
    window.setTimeout(() => {
      updateSession({ transition: null });
      busy = false;
    }, inn);
  }, out);
}

export const isTransitioning = () => busy;
