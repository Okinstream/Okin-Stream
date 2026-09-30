import type { CupState } from '../../systems/roomState';
import { mulberry32 } from '../../utils/random';

/* Tous les objets sont dessinés dans leur repère local puis placés par la pièce. */

const RIM = 'rgba(190, 205, 230, 0.22)';
const WOOD = '#0c1018';
const WOOD_FAR = '#080b11';

// ─── chaise ──────────────────────────────────────────────
// Origine : sol, sous l'avant de l'assise. Dossier à gauche (regarde vers la droite).
export function Chair({ ghost = false }: { ghost?: boolean }) {
  const rim = ghost ? 'rgba(190,205,230,0.12)' : RIM;
  return (
    <g>
      <ellipse cx={4} cy={2} rx={62} ry={9} fill="#000" opacity={0.45} />
      <rect x={-30} y={-148} width={4} height={140} fill={WOOD_FAR} />
      <rect x={46} y={-86} width={4} height={78} fill={WOOD_FAR} />
      <polygon points="-44,-80 40,-80 52,-90 -32,-90" fill="#111723" />
      <rect x={-44} y={-80} width={84} height={7} fill={WOOD} stroke={rim} strokeWidth={0.8} />
      <rect x={-32} y={-184} width={4} height={96} fill={WOOD_FAR} />
      <polygon points="-44,-170 -30,-181 -30,-157 -44,-146" fill="#0f141e" stroke={rim} strokeWidth={0.6} />
      <rect x={-44} y={-176} width={5} height={176} fill={WOOD} stroke={rim} strokeWidth={0.8} />
      <rect x={36} y={-73} width={5} height={73} fill={WOOD} stroke={rim} strokeWidth={0.6} />
    </g>
  );
}

// ─── table ───────────────────────────────────────────────
// Origine : centre du plateau.
export function Table() {
  return (
    <g>
      <ellipse cx={0} cy={100} rx={70} ry={12} fill="#000" opacity={0.5} />
      <rect x={-5} y={8} width={10} height={88} fill={WOOD} />
      <ellipse cx={0} cy={96} rx={38} ry={7} fill={WOOD} stroke={RIM} strokeWidth={0.5} />
      <path d="M-105,0 A105,24 0 0 0 105,0 L105,7 A105,24 0 0 1 -105,7 Z" fill="#090d14" />
      <ellipse cx={0} cy={0} rx={105} ry={24} fill="url(#tableTop)" stroke={RIM} strokeWidth={0.6} />
    </g>
  );
}

// ─── téléphone ───────────────────────────────────────────
export function Phone({ glow, ringing }: { glow: boolean; ringing: boolean }) {
  return (
    <g className={ringing ? 'vibrate' : undefined}>
      {glow && <ellipse cx={0} cy={-6} rx={46} ry={16} fill="url(#screenGlow)" className="breathe" />}
      <polygon points="-21,-2 15,-6 24,2 -12,6" fill="#05070a" stroke="rgba(190,205,230,0.25)" strokeWidth={0.6} />
      <polygon
        points="-18,-1.5 13,-5 20,1.5 -10,5"
        fill={glow ? 'rgba(185,205,240,0.85)' : '#0b0f16'}
        className={glow ? 'breathe' : undefined}
      />
    </g>
  );
}

// ─── tasse ───────────────────────────────────────────────
// Origine : base de la tasse.
export function Cup({ state = 'cold' as CupState | 'mine' }: { state?: CupState | 'mine' }) {
  if (state === 'none') return null;
  if (state === 'broken') {
    return (
      <g>
        <ellipse cx={0} cy={1} rx={16} ry={3} fill="#000" opacity={0.5} />
        <path d="M-9,0 L-10,-16 L-4,-11 L0,-17 L3,-9 L8,-14 L9,0 Q0,3 -9,0 Z" fill="url(#cupBody)" />
        <polygon points="14,1 20,-2 23,2" fill="#a7a298" opacity={0.7} />
        <polygon points="-18,2 -14,-1 -12,3" fill="#a7a298" opacity={0.6} />
      </g>
    );
  }
  const warm = state === 'warm';
  return (
    <g>
      <ellipse cx={0} cy={1} rx={14} ry={3} fill="#000" opacity={0.5} />
      <path d="M10,-14 q8,1 7,6 q-1,5 -8,3" fill="none" stroke="#9d998f" strokeWidth={2} />
      <path d="M-9,0 L-10,-16 Q-10,-18 -8,-18 L8,-18 Q10,-18 10,-16 L9,0 Q0,3 -9,0 Z" fill="url(#cupBody)" />
      <ellipse cx={0} cy={-18} rx={9.5} ry={2.6} fill={warm ? '#2a1d14' : '#1a1512'} stroke="#c8c3b8" strokeWidth={0.6} />
      {warm && (
        <g className="steam" fill="none" stroke="rgba(232,228,218,0.22)" strokeWidth={1.4} strokeLinecap="round">
          <path d="M-3,-22 q-5,-8 0,-16 q5,-8 0,-16" />
          <path d="M3,-24 q5,-8 0,-15 q-5,-8 0,-15" />
        </g>
      )}
    </g>
  );
}

// ─── horloge : voir Clock.tsx ────────────────────────────

// ─── fenêtre ─────────────────────────────────────────────
export function Window({
  w,
  h,
  rain,
  open,
  figure,
  opposite,
}: {
  w: number;
  h: number;
  rain: boolean;
  open: boolean;
  figure: boolean;
  opposite: boolean;
}) {
  const rng = mulberry32(317);
  const cols = 6;
  const rows = 4;
  const bx = w * 0.12;
  const by = h * 0.42;
  const cw = (w * 0.76) / cols;
  const ch = (h * 0.5) / rows;
  const lit: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (rng() < 0.16) lit.push([c, r]);
  // La fenêtre d'en face : toujours la même.
  const fx = 3;
  const fy = 1;

  return (
    <g>
      <defs>
        <clipPath id="glass">
          <rect x={0} y={0} width={w} height={h} />
        </clipPath>
      </defs>
      <rect x={-10} y={-10} width={w + 20} height={h + 20} fill="#070a10" />
      <g clipPath="url(#glass)">
        <rect x={0} y={0} width={w} height={h} fill={open ? 'url(#dawn)' : 'url(#night)'} />
        {/* immeuble d'en face */}
        <rect x={bx - 14} y={by - 22} width={w * 0.76 + 28} height={h} fill="#05080d" />
        {Array.from({ length: rows * cols }, (_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const isLit = lit.some(([a, b]) => a === c && b === r);
          const isOpp = c === fx && r === fy;
          const on = isOpp ? opposite : isLit;
          return (
            <rect
              key={i}
              x={bx + c * cw + cw * 0.2}
              y={by + r * ch + ch * 0.18}
              width={cw * 0.6}
              height={ch * 0.62}
              fill={on ? (isOpp ? '#8a7248' : '#4b4234') : '#0a0e15'}
              opacity={on ? (isOpp ? 0.75 : 0.5) : 1}
            />
          );
        })}
        <g className="figure" style={{ opacity: figure ? 0.85 : 0 }}>
          <path
            transform={`translate(${bx + fx * cw + cw * 0.5}, ${by + fy * ch + ch * 0.8})`}
            d="M-3,0 L-3.4,-7 Q-4,-9 -2,-10 A2.2,2.2 0 1 1 2,-10 Q4,-9 3.4,-7 L3,0 Z"
            fill="#1a130b"
          />
        </g>
        {rain && (
          <g className="rain">
            <rect x={0} y={-h} width={w} height={h * 2} fill="url(#rainPattern)" />
          </g>
        )}
        <rect x={0} y={0} width={w} height={h} fill="url(#glassSheen)" />
        {open && <rect x={0} y={0} width={w / 2} height={h} fill="#05070b" opacity={0.55} />}
      </g>
      {/* cadre */}
      <g fill="none" stroke="#2a3140" strokeWidth={6}>
        <rect x={0} y={0} width={w} height={h} />
        <line x1={w / 2} y1={0} x2={w / 2} y2={h} strokeWidth={4} />
        <line x1={0} y1={h * 0.46} x2={w} y2={h * 0.46} strokeWidth={4} />
      </g>
      <rect x={-18} y={h + 3} width={w + 36} height={9} fill="#141a25" stroke={RIM} strokeWidth={0.5} />
      {/* voilage */}
      <rect x={w - w * 0.2} y={-12} width={w * 0.3} height={h + 30} fill="url(#curtain)" className={open ? 'curtain open' : 'curtain'} />
    </g>
  );
}

// ─── porte ───────────────────────────────────────────────
export function Door({ w, h, ajar, handle = true }: { w: number; h: number; ajar: boolean; handle?: boolean }) {
  return (
    <g>
      <rect x={-12} y={-12} width={w + 24} height={h + 12} fill="#0a0e15" stroke={RIM} strokeWidth={0.5} />
      <rect x={0} y={0} width={w} height={h} fill="url(#doorPanel)" />
      <rect x={w * 0.14} y={h * 0.08} width={w * 0.72} height={h * 0.36} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={2} />
      <rect x={w * 0.14} y={h * 0.52} width={w * 0.72} height={h * 0.4} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={2} />
      {handle && (
        <g>
          <circle cx={w - 18} cy={h * 0.52} r={4} fill="#5b5f66" />
          <rect x={w - 30} y={h * 0.52 - 1.6} width={14} height={3.2} rx={1.6} fill="#6c7078" />
        </g>
      )}
      {ajar && (
        <g>
          <rect x={w - 7} y={0} width={7} height={h} fill="#010203" />
          <rect x={w - 4} y={0} width={1.2} height={h} fill="rgba(210,222,245,0.55)" className="breathe" />
        </g>
      )}
    </g>
  );
}

// ─── photo ───────────────────────────────────────────────
export function PhotoFrame({ people }: { people: boolean[] }) {
  return (
    <g>
      <rect x={-4} y={-4} width={66} height={52} fill="#0b0e14" stroke={RIM} strokeWidth={0.6} />
      <rect x={0} y={0} width={58} height={44} fill="url(#sepia)" />
      {people.map((on, i) =>
        on ? <Silhouette key={i} x={9 + i * 13} y={40} s={0.55} /> : null,
      )}
      <rect x={0} y={0} width={58} height={44} fill="#05070b" opacity={0.35} />
    </g>
  );
}

export function Silhouette({ x, y, s, fill = '#2b2118' }: { x: number; y: number; s: number; fill?: string }) {
  return (
    <path
      transform={`translate(${x},${y}) scale(${s})`}
      d="M-9,0 L-9,-22 Q-9,-30 -3,-31 A6,6 0 1 1 3,-31 Q9,-30 9,-22 L9,0 Z"
      fill={fill}
    />
  );
}

// ─── plante ──────────────────────────────────────────────
const LEAVES: [number, number][] = [
  [-60, 46],
  [-35, 58],
  [-12, 66],
  [8, 62],
  [30, 55],
  [55, 44],
  [-80, 34],
  [75, 36],
  [0, 74],
];

export function Plant({ leaves, fallen }: { leaves: number; fallen: number }) {
  return (
    <g>
      {Array.from({ length: fallen }, (_, i) => (
        <ellipse key={i} cx={22 + i * 11} cy={6 + (i % 2) * 5} rx={6} ry={2} fill="#1d2a1f" transform={`rotate(${i * 37} ${22 + i * 11} 6)`} />
      ))}
      <g className="sway">
        {LEAVES.slice(0, leaves).map(([a, len], i) => {
          const rad = ((a - 90) * Math.PI) / 180;
          const x = Math.cos(rad) * len;
          const y = -34 + Math.sin(rad) * len;
          return (
            <g key={i}>
              <path d={`M0,-34 Q${x * 0.4},${-34 + (y + 34) * 0.7} ${x},${y}`} stroke="#18241b" strokeWidth={1.5} fill="none" />
              <ellipse cx={x} cy={y} rx={9} ry={3.5} fill="#1b2a1e" stroke="rgba(160,190,170,0.15)" strokeWidth={0.5} transform={`rotate(${a} ${x} ${y})`} />
            </g>
          );
        })}
      </g>
      <polygon points="-20,-36 20,-36 15,0 -15,0" fill="#1a1d24" stroke={RIM} strokeWidth={0.5} />
    </g>
  );
}

// ─── lampe ───────────────────────────────────────────────
// Origine : pied.
export function Lamp({ on }: { on: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={0} rx={34} ry={6} fill="#0a0d13" />
      <rect x={-2} y={-400} width={4} height={400} fill="#121722" stroke={RIM} strokeWidth={0.5} />
      {on && <circle cx={0} cy={-420} r={120} fill="url(#lampGlow)" className="flicker" />}
      <polygon points="-40,-395 40,-395 26,-452 -26,-452" fill={on ? 'url(#shadeOn)' : '#141821'} />
    </g>
  );
}
