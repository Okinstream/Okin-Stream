export type SceneId = 'room' | 'corridor' | 'void';

export type ObjectId =
  | 'clock'
  | 'phone'
  | 'cup'
  | 'cup2'
  | 'chair'
  | 'chair2'
  | 'window'
  | 'door'
  | 'plant'
  | 'lamp'
  | 'photo';

export type Quality = 'auto' | 'low' | 'high';

export interface Settings {
  volume: number;
  muted: boolean;
  reducedMotion: boolean;
  quality: Quality;
}

/** Ce que l'histoire retient du visiteur. */
export interface StoryFlags {
  phoneOpens?: number;
  callsIgnored?: number;
  lastIgnoredCallAt?: number;
  callsAnswered?: number;
  lampOff?: boolean;
  lampWasLeftOff?: boolean;
  emptyChairTouches?: number;
  photoFlipped?: boolean;
  corridorEnd?: boolean;
  doorOutcomes?: string[];
  /** Horodatage du moment où le mot a été dit. */
  said?: number;
}

/** Persisté dans localStorage. Aucune donnée personnelle. */
export interface Memory {
  v: 1;
  visitCount: number;
  firstVisitAt: number;
  lastSeenAt: number;
  visitTimes: number[];
  timeSpent: number;
  visitedScenes: Partial<Record<SceneId, number>>;
  discoveredClues: string[];
  objectsInteracted: Partial<Record<ObjectId, number>>;
  attention: Partial<Record<ObjectId, number>>;
  voidRevealed: string[];
  voidTime: number;
  plantLeaves: number;
  storyFlags: StoryFlags;
  settings: Settings;
}

export type Overlay = null | 'phone' | 'photo';
export type CallState = 'none' | 'ringing' | 'answered' | 'missed';

export interface Transition {
  to: SceneId;
  stage: 'out' | 'in';
  tone: 'black' | 'white';
  ms: number;
}

/** Vit le temps d'une visite, jamais persisté. */
export interface Session {
  startedAt: number;
  isNewVisit: boolean;
  absenceMs: number;
  previousVisitTimes: number[];
  activeMs: number;
  phase: number;
  focus: ObjectId | null;
  sceneEnteredAt: number;
  introDone: boolean;
  overlay: Overlay;
  phoneOpenedHere: boolean;
  call: CallState;
  notification: string | null;
  clockRunning: boolean;
  idle: boolean;
  audioAwake: boolean;
  justSaid: boolean;
  /** Nombre de fois où la porte a ramené ici même. */
  loops: number;
  transition: Transition | null;
}

export interface GameState {
  memory: Memory;
  session: Session;
  scene: SceneId;
}
