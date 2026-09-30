import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../../audio/engine';
import { discover } from '../../systems/clues';
import { go } from '../../systems/sceneEngine';
import { getState, updateFlags, useGame } from '../../state/store';
import { clamp, mulberry32 } from '../../utils/random';

/* Le couloir est projeté à la main : une perspective réelle, sans WebGL. */

const HALF = 1.25; // demi-largeur
const CEIL = 2.7;
const EYE = 1.6;
const DOOR_W = 0.95;
const DOOR_H = 2.1;
const FIRST = 3;
const STEP = 1.6; // une porte tous les 1,6 m, alternant les côtés
const NEAR = 0.25;
const FAR = 34;

interface DoorDef {
  i: number;
  z: number;
  side: -1 | 1;
  label: string;
  handle: boolean;
  ajar: boolean;
  leadsToVoid: boolean;
}

function buildDoors(phase: number): DoorDef[] {
  const n = Math.min(44, 8 + phase * 5);
  const rng = mulberry32(322);
  return Array.from({ length: n }, (_, i) => {
    const num = 301 + i;
    const isS = num === 317;
    const is322 = num === 322;
    const r = rng();
    return {
      i,
      z: FIRST + i * STEP,
      side: i % 2 === 0 ? -1 : 1,
      label: isS ? 'S' : String(num),
      handle: !isS && r > 0.08,
      ajar: is322 || (r > 0.86 && !isS),
      leadsToVoid: is322,
    } as DoorDef;
  });
}

type Pt = [number, number];

export default function Corridor() {
  const phase = useGame((s) => s.session.phase);
  const [tall] = useState(() => window.matchMedia('(max-aspect-ratio: 4/5)').matches);
  const W = tall ? 900 : 1600;
  const H = tall ? 1600 : 900;
  const F = tall ? 560 : 720;
  const doors = useMemo(() => buildDoors(phase), [phase]);
  const endZ = doors[doors.length - 1].z + 16;

  const [cam, setCam] = useState(0);
  const camRef = useRef(0);
  const target = useRef(0);
  const raf = useRef(0);
  const travelled = useRef(0);
  const [still, setStill] = useState(false);
  const [shadow, setShadow] = useState(false);
  const [figureGone, setFigureGone] = useState(false);
  const [rattling, setRattling] = useState<number | null>(null);

  const cx = W / 2;
  const cy = H * 0.47 + (getState().memory.settings.reducedMotion ? 0 : Math.sin(cam * 3.9) * 2.2);

  const project = useCallback(
    (x: number, y: number, z: number): Pt | null => {
      const d = z - cam;
      if (d < NEAR * 0.99) return null;
      return [cx + (F * x) / d, cy - (F * (y - EYE)) / d];
    },
    [cam, cx, cy, F],
  );

  // ─── marche ────────────────────────────────────────────
  const animate = useCallback(() => {
    const t = target.current;
    const c = camRef.current;
    const next = c + (t - c) * 0.055;
    travelled.current += Math.abs(next - c);
    if (travelled.current > 0.85) {
      travelled.current = 0;
      audio.play('step', { level: 0.8, pan: Math.random() * 0.2 - 0.1 });
    }
    camRef.current = next;
    setCam(next);
    if (Math.abs(t - next) > 0.004) raf.current = requestAnimationFrame(animate);
    else raf.current = 0;
  }, []);

  const walk = useCallback(
    (delta: number) => {
      target.current = clamp(target.current + delta, -0.6, endZ - 2.4);
      setStill(false);
      setShadow(false);
      if (target.current < -0.4) {
        go('room');
        return;
      }
      if (!raf.current) raf.current = requestAnimationFrame(animate);
    },
    [animate, endZ],
  );

  useEffect(() => {
    let wheelAcc = 0;
    const wheel = (e: WheelEvent) => {
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) > 40) {
        walk(wheelAcc > 0 ? 0.9 : -0.9);
        wheelAcc = 0;
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'z') walk(1.6);
      else if (e.key === 'ArrowDown' || e.key === 's') walk(-1.6);
      else if (e.key === 'Escape') go('room');
    };
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
      cancelAnimationFrame(raf.current);
    };
  }, [walk]);

  // ─── immobilité : quelqu'un marche derrière ────────────
  useEffect(() => {
    if (raf.current) return;
    const t1 = window.setTimeout(() => setStill(true), 4000);
    return () => window.clearTimeout(t1);
  }, [cam]);

  useEffect(() => {
    if (!still || camRef.current < 7) return;
    const timers = [0, 640, 1300].map((d, i) =>
      window.setTimeout(() => audio.play('stepFar', { level: 0.9 - i * 0.25, pan: 0.05 }), d),
    );
    const s = window.setTimeout(() => {
      setShadow(true);
      discover('corridor-steps');
    }, 1900);
    return () => [...timers, s].forEach((t) => window.clearTimeout(t));
  }, [still]);

  // ─── découvertes par la position ───────────────────────
  useEffect(() => {
    const sDoor = doors.find((d) => d.label === 'S');
    if (sDoor && cam > sDoor.z - 5) discover('corridor-317');
    if (cam > endZ - 17 && !figureGone) {
      setFigureGone(true);
      updateFlags(() => ({ corridorEnd: true }));
    }
  }, [cam, doors, endZ, figureGone]);

  const clickDoor = (d: DoorDef) => {
    const dist = d.z - camRef.current;
    if (dist > 7) {
      walk(dist - 3.2);
      return;
    }
    if (d.label === 'S') {
      // Pas de poignée. Rien ne se passe.
      discover('corridor-s');
      return;
    }
    if (d.leadsToVoid) {
      discover('corridor-322');
      audio.play('door', { pan: d.side * 0.5 });
      go('void', { out: 2600, in: 3400 });
      return;
    }
    audio.play('locked', { pan: d.side * 0.6 });
    setRattling(d.i);
    window.setTimeout(() => setRattling(null), 600);
  };

  // ─── dessin ────────────────────────────────────────────
  const fog = (z: number) => clamp(1 - (z - cam) / FAR, 0, 1);
  const poly = (pts: (Pt | null)[]) => (pts.every(Boolean) ? (pts as Pt[]).map((p) => p.join(',')).join(' ') : null);
  const vp: Pt = [cx, cy];
  const nearZ = cam + NEAR;

  const nl = project(-HALF, 0, nearZ)!;
  const nr = project(HALF, 0, nearZ)!;
  const nlt = project(-HALF, CEIL, nearZ)!;
  const nrt = project(HALF, CEIL, nearZ)!;
  const endD = endZ - cam;
  const el = project(-HALF, 0, endZ);
  const er = project(HALF, 0, endZ);
  const elt = project(-HALF, CEIL, endZ);
  const ert = project(HALF, CEIL, endZ);

  const lines = [];
  for (let z = Math.ceil(cam); z < Math.min(endZ, cam + FAR); z += 1) {
    const a = project(-HALF, 0, z);
    const b = project(HALF, 0, z);
    if (a && b) lines.push(<line key={z} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#c8d4ec" strokeOpacity={0.05 * fog(z)} />);
  }

  const lamps = [];
  for (let z = 4; z < endZ; z += 5.2) {
    const d = z - cam;
    if (d < NEAR || d > FAR) continue;
    const p = poly([project(-0.18, CEIL, z), project(0.18, CEIL, z), project(0.18, CEIL, z + 0.6), project(-0.18, CEIL, z + 0.6)]);
    const c = project(0, CEIL - 0.1, z + 0.3);
    if (!p || !c) continue;
    const flick = Math.round(z * 7) % 5 === 0;
    lamps.push(
      <g key={z} className={flick ? 'flicker-hard' : undefined} opacity={fog(z)}>
        <circle cx={c[0]} cy={c[1] + F * 0.6 / d} r={(F * 1.4) / d} fill="url(#corrLamp)" />
        <polygon points={p} fill="#d9e0ea" opacity={0.7} />
      </g>,
    );
  }

  const doorEls = doors
    .filter((d) => d.z + DOOR_W > cam + NEAR && d.z - cam < FAR)
    .reverse()
    .map((d) => {
      const x = d.side * HALF;
      const z0 = d.z;
      const z1 = d.z + DOOR_W;
      const frame = poly([project(x, 0, z0 - 0.06), project(x, DOOR_H + 0.08, z0 - 0.06), project(x, DOOR_H + 0.08, z1 + 0.06), project(x, 0, z1 + 0.06)]);
      const panel = poly([project(x, 0, z0), project(x, DOOR_H, z0), project(x, DOOR_H, z1), project(x, 0, z1)]);
      if (!panel || !frame) return null;
      const o = fog(d.z);
      // Plaque : transformation affine locale pour écrire « sur » le mur.
      // Sur le mur droit, l'axe de profondeur va vers la gauche : on inverse pour ne pas écrire en miroir.
      const za = d.side < 0 ? z0 + 0.3 : z0 + 0.54;
      const zb = d.side < 0 ? z0 + 0.42 : z0 + 0.42;
      const p0 = project(x, 1.86, za);
      const pu = project(x, 1.86, zb);
      const pv = project(x, 1.74, za);
      const handle = project(x, 1.0, z1 - 0.1);
      const gap = d.ajar ? poly([project(x, 0, z0), project(x, DOOR_H, z0), project(x, DOOR_H, z0 + 0.05), project(x, 0, z0 + 0.05)]) : null;
      const dist = d.z - cam;
      return (
        <g
          key={d.i}
          className={`c-door ${rattling === d.i ? 'rattle' : ''}`}
          opacity={o}
          data-cursor={dist < 7 && d.label !== 'S' ? 'object' : 'pseudo'}
          role="button"
          tabIndex={dist < 9 ? 0 : -1}
          aria-label={`porte ${d.label}`}
          onClick={(e) => {
            e.stopPropagation();
            clickDoor(d);
          }}
          onKeyDown={(e) => e.key === 'Enter' && clickDoor(d)}
        >
          <polygon points={frame} fill="#0d121b" />
          <polygon points={panel} fill={d.side < 0 ? '#121a27' : '#0f1520'} stroke="rgba(190,205,230,0.08)" />
          {gap && <polygon points={gap} fill="#dfe7f5" opacity={0.28} className="breathe" />}
          {d.handle && handle && (
            <ellipse cx={handle[0]} cy={handle[1]} rx={Math.max(0.4, (F * 0.012) / dist)} ry={Math.max(0.6, (F * 0.022) / dist)} fill="#4c515a" />
          )}
          {p0 && pu && pv && (
            <g transform={`matrix(${pu[0] - p0[0]},${pu[1] - p0[1]},${pv[0] - p0[0]},${pv[1] - p0[1]},${p0[0]},${p0[1]})`}>
              <rect x={0} y={0} width={2} height={1} fill="#1d2330" />
              <text
                x={1}
                y={0.78}
                fontSize={0.72}
                textAnchor="middle"
                fill={d.label === 'S' ? '#b9b3a6' : '#8b919c'}
                fontFamily="Cormorant Garamond, serif"
                style={{ letterSpacing: '0.02em' }}
              >
                {d.label}
              </text>
            </g>
          )}
        </g>
      );
    });

  // Silhouette au fond : elle garde toujours la même distance, puis n'est plus là.
  const figZ = clamp(cam + 12.5, 0, endZ - 0.8);
  const figBase = project(0.12, 0, figZ);
  const figScale = F / (figZ - cam);
  const figureVisible = !figureGone && cam > 1.2;

  const endDoor = poly([project(-0.5, 0, endZ), project(-0.5, DOOR_H, endZ), project(0.5, DOOR_H, endZ), project(0.5, 0, endZ)]);

  return (
    <div className="corridor" onClick={() => walk(2.4)} data-cursor="object">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-label="un couloir">
        <defs>
          <linearGradient id="cWallL" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#141c2a" />
            <stop offset="1" stopColor="#030407" />
          </linearGradient>
          <linearGradient id="cWallR" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#111826" />
            <stop offset="1" stopColor="#030407" />
          </linearGradient>
          <linearGradient id="cFloor" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#0f141d" />
            <stop offset="1" stopColor="#020305" />
          </linearGradient>
          <radialGradient id="corrLamp">
            <stop offset="0" stopColor="#dfe6f2" stopOpacity="0.18" />
            <stop offset="1" stopColor="#dfe6f2" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="endGlow">
            <stop offset="0" stopColor="#9fb0cc" stopOpacity="0.2" />
            <stop offset="1" stopColor="#9fb0cc" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nearLight" cx="0.5" cy="1" r="0.7">
            <stop offset="0" stopColor="#c8d4ec" stopOpacity="0.09" />
            <stop offset="1" stopColor="#c8d4ec" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="behind" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0.95" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="#020305" />
        <polygon points={`${nlt.join(',')} ${nl.join(',')} ${vp.join(',')}`} fill="url(#cWallL)" />
        <polygon points={`${nrt.join(',')} ${nr.join(',')} ${vp.join(',')}`} fill="url(#cWallR)" />
        <polygon points={`${nl.join(',')} ${nr.join(',')} ${vp.join(',')}`} fill="url(#cFloor)" />
        <polygon points={`${nlt.join(',')} ${nrt.join(',')} ${vp.join(',')}`} fill="#040509" />
        {el && er && elt && ert && (
          <g opacity={clamp(1 - endD / (FAR + 10), 0.15, 1)}>
            <polygon points={`${elt.join(',')} ${ert.join(',')} ${er.join(',')} ${el.join(',')}`} fill="#080b11" />
            <circle cx={(el[0] + er[0]) / 2} cy={(elt[1] + el[1]) / 2} r={Math.abs(er[0] - el[0])} fill="url(#endGlow)" />
            {endDoor && (
              <polygon
                points={endDoor}
                fill="#121a27"
                stroke="rgba(190,205,230,0.12)"
                data-cursor="object"
                role="button"
                tabIndex={endD < 9 ? 0 : -1}
                aria-label="porte"
                onClick={(e) => {
                  e.stopPropagation();
                  if (endD > 7) return walk(endD - 3);
                  audio.play('door');
                  go('room', { out: 2400 });
                }}
              />
            )}
          </g>
        )}
        {lines}
        {lamps}
        {figBase && (
          <g className="c-figure" style={{ opacity: figureVisible ? 0.62 : 0 }} pointerEvents="none">
            <path
              transform={`translate(${figBase[0]},${figBase[1]}) scale(${figScale / 100})`}
              d="M-19,0 L-17,-100 Q-22,-128 -12,-142 A12,13 0 1 1 12,-142 Q22,-128 17,-100 L19,0 Z"
              fill="#010102"
            />
          </g>
        )}
        {doorEls}
        <rect
          x={0}
          y={H * 0.86}
          width={W}
          height={H * 0.14}
          fill="transparent"
          data-cursor="pseudo"
          onClick={(e) => {
            e.stopPropagation();
            walk(-2.4);
          }}
        />
        {/* La lumière qui vient de derrière toi. Quelqu'un peut s'y tenir. */}
        <ellipse cx={W / 2} cy={H} rx={W * 0.32} ry={H * 0.3} fill="url(#nearLight)" pointerEvents="none" />
        <path
          d={`M${W * 0.42},${H} Q${W * 0.47},${H * 0.8} ${W * 0.5},${H * 0.72} Q${W * 0.53},${H * 0.8} ${W * 0.58},${H} Z`}
          fill="url(#behind)"
          className="c-shadow"
          style={{ opacity: shadow ? 0.8 : 0 }}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}
