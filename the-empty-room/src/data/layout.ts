/**
 * Deux compositions de la même pièce.
 * Desktop : plan large, tous les objets. Mobile : cadrage vertical, plus abstrait, plus de noir.
 */
export interface Place {
  x: number;
  y: number;
  s: number;
}

export interface RoomLayout {
  kind: 'wide' | 'tall';
  w: number;
  h: number;
  wall: { x0: number; y0: number; x1: number; y1: number };
  vp: { x: number; y: number };
  window: { x: number; y: number; w: number; h: number };
  clock: { x: number; y: number; r: number };
  photo: Place;
  door: { x: number; y: number; w: number; h: number };
  table: Place;
  chair: Place;
  chair2: Place;
  chair2After: Place;
  plant: Place | null;
  lamp: Place | null;
  lampPool: { x: number; y: number; rx: number; ry: number };
  moonShaft: string;
  moonPatch: string;
  boards: number;
}

export const WIDE: RoomLayout = {
  kind: 'wide',
  w: 1600,
  h: 900,
  wall: { x0: 400, y0: 150, x1: 1200, y1: 640 },
  vp: { x: 800, y: 395 },
  window: { x: 470, y: 215, w: 230, h: 265 },
  clock: { x: 800, y: 250, r: 34 },
  photo: { x: 866, y: 318, s: 1 },
  door: { x: 1010, y: 262, w: 140, h: 378 },
  table: { x: 735, y: 700, s: 1 },
  chair: { x: 590, y: 800, s: 1 },
  chair2: { x: 1190, y: 770, s: 0.92 },
  chair2After: { x: 905, y: 800, s: 1 },
  plant: { x: 452, y: 652, s: 1 },
  lamp: { x: 262, y: 905, s: 1.25 },
  lampPool: { x: 360, y: 820, rx: 320, ry: 90 },
  moonShaft: '470,215 700,215 930,880 600,880',
  moonPatch: '560,665 770,665 930,880 600,880',
  boards: 16,
};

export const TALL: RoomLayout = {
  kind: 'tall',
  w: 900,
  h: 1600,
  wall: { x0: 150, y0: 420, x1: 750, y1: 1080 },
  vp: { x: 450, y: 760 },
  window: { x: 195, y: 480, w: 175, h: 235 },
  clock: { x: 455, y: 505, r: 30 },
  photo: { x: 428, y: 585, s: 0.95 },
  door: { x: 560, y: 600, w: 150, h: 480 },
  table: { x: 430, y: 1270, s: 1.3 },
  chair: { x: 225, y: 1400, s: 1.3 },
  chair2: { x: 830, y: 1350, s: 1.2 },
  chair2After: { x: 650, y: 1400, s: 1.3 },
  plant: null,
  lamp: null,
  lampPool: { x: 260, y: 1320, rx: 300, ry: 110 },
  moonShaft: '195,480 370,480 560,1600 250,1600',
  moonPatch: '260,1110 430,1110 560,1600 250,1600',
  boards: 10,
};
