import { useMemo } from 'react';
import { updateMemory } from '../state/store';
import type { ObjectId } from '../state/types';

/**
 * Le site mesure ce que le visiteur regarde, et combien de temps.
 * L'objet le plus regardé prend de l'importance à la visite suivante.
 */
const pending: Partial<Record<ObjectId, number>> = {};
const since: Partial<Record<ObjectId, number>> = {};

function flush() {
  const entries = Object.entries(pending) as [ObjectId, number][];
  if (!entries.length) return;
  for (const [id] of entries) delete pending[id];
  updateMemory((m) => {
    const attention = { ...m.attention };
    for (const [id, ms] of entries) attention[id] = (attention[id] ?? 0) + ms;
    return { attention };
  });
}

window.setInterval(flush, 3000);
window.addEventListener('pagehide', flush);

function start(id: ObjectId) {
  since[id] = performance.now();
}

function stop(id: ObjectId) {
  const t = since[id];
  if (t === undefined) return;
  delete since[id];
  const ms = performance.now() - t;
  if (ms > 250) pending[id] = (pending[id] ?? 0) + Math.min(ms, 60_000);
}

export function useAttention(id: ObjectId) {
  return useMemo(
    () => ({
      onPointerEnter: () => start(id),
      onPointerLeave: () => stop(id),
      onFocus: () => start(id),
      onBlur: () => stop(id),
    }),
    [id],
  );
}

export function touch(id: ObjectId) {
  updateMemory((m) => ({
    objectsInteracted: { ...m.objectsInteracted, [id]: (m.objectsInteracted[id] ?? 0) + 1 },
  }));
}
