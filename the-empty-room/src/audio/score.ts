/**
 * Une ballade qui ne finit jamais de commencer.
 * Ré mineur, i – VI – iv – V (Dm – B♭ – Gm – A), une mesure ≈ 4,8 s.
 */
export const midiToHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Chord {
  root: number;
  pad: number[];
  melody: number[];
}

export const BALLAD: { barSeconds: number; progression: Chord[] } = {
  barSeconds: 4.8,
  progression: [
    { root: 50, pad: [50, 57, 62, 65], melody: [69, 72, 74, 77, 76] }, // Dm
    { root: 46, pad: [46, 53, 58, 62], melody: [70, 74, 77, 72, 69] }, // B♭
    { root: 43, pad: [43, 50, 55, 58], melody: [67, 70, 74, 72] }, // Gm
    { root: 45, pad: [45, 52, 57, 61], melody: [69, 73, 76, 71] }, // A (le do dièse : l'attente)
  ],
};

/** Dans le vide : pentatonique suspendue, jamais résolue. */
export const VOID_NOTES = [74, 76, 81, 83, 86, 88];
