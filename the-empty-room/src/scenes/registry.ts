import { understanding } from '../systems/clues';
import { defineScene, prefetch } from '../systems/sceneEngine';
import { deriveRoom } from '../systems/roomState';

/**
 * Ajouter une scène = ajouter une entrée ici et un composant par défaut.
 * Rien d'autre à modifier.
 */

const loadRoom = () => import('./room/Room');
const loadCorridor = () => import('./corridor/Corridor');
const loadVoid = () => import('./void/Void');

defineScene({
  id: 'room',
  load: loadRoom,
  atmosphere: { dust: 1, grain: 0.06, vignette: 0.85, fog: 0.35 },
  audioMode: 'ballad',
  audio: (s) => {
    const room = deriveRoom(s);
    const u = understanding(s);
    return {
      drone: room.emptied ? 0.2 : 0.45,
      air: 0.35,
      rain: room.rain ? 0.55 : 0,
      wind: room.windowOpen ? 0.12 : 0,
      clock: 1,
      ballad: room.emptied ? 0 : Math.min(0.9, 0.12 + u * 0.06),
    };
  },
});

defineScene({
  id: 'corridor',
  load: loadCorridor,
  atmosphere: { dust: 0.4, grain: 0.08, vignette: 0.95, fog: 0.6 },
  audioMode: 'ballad',
  audio: (s) => ({
    drone: 0.35,
    air: 0.15,
    rain: 0,
    wind: 0.5,
    clock: 0,
    ballad: Math.min(0.4, understanding(s) * 0.03),
  }),
});

defineScene({
  id: 'void',
  load: loadVoid,
  atmosphere: { dust: 0.15, grain: 0.05, vignette: 1, fog: 0 },
  audioMode: 'void',
  audio: () => ({ drone: 0.12, air: 0.04, rain: 0, wind: 0, clock: 0, ballad: 0.7 }),
});

// La pièce est chargée tout de suite ; le reste quand le navigateur respire.
prefetch(loadCorridor);
prefetch(loadVoid);
