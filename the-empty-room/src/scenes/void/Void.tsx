import { useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../../audio/engine';
import { VOID_ITEMS, type Shape, type VoidItem } from '../../data/fragments';
import { matches, normalizeLetter, speak } from '../../puzzles/key';
import { discover } from '../../systems/clues';
import { go } from '../../systems/sceneEngine';
import { getState, updateMemory, useGame } from '../../state/store';
import { VoidShape } from './shapes';

const BASE_R = 70;
const MAX_R = 300;
const GROW_MS = 6000;

interface Letter {
  id: number;
  ch: string;
  x: number;
  y: number;
}

/**
 * Le vide n'est pas vide.
 * Une lumière suit le regard ; l'immobilité l'élargit et révèle.
 * Ce qui a été vu reste, très faiblement, d'une visite à l'autre.
 */
export default function Void() {
  const memory = useGame((s) => s.memory);
  const session = useGame((s) => s.session);
  const state = useMemo(() => ({ memory, session, scene: 'void' as const }), [memory, session]);
  const items = useMemo(() => VOID_ITEMS.filter((i) => i.when(state)), [state]);
  const revealed = useMemo(() => new Set(memory.voidRevealed), [memory.voidRevealed]);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const light = useRef({ tx: 0.5, ty: 0.45, x: 0.5, y: 0.45, r: BASE_R, lastMove: performance.now() });
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  const [bloom, setBloom] = useState(false);
  const [letters, setLetters] = useState<Letter[]>([]);
  const buffer = useRef('');
  const letterId = useRef(0);

  // ─── lumière ──────────────────────────────────────────
  useEffect(() => {
    const el = rootRef.current!;
    let raf = 0;
    const L = light.current;
    L.x = L.tx = 0.5;
    L.y = L.ty = 0.45;

    const frame = () => {
      const now = performance.now();
      const still = now - L.lastMove;
      const k = getState().memory.settings.reducedMotion ? 1 : 0.06;
      L.x += (L.tx - L.x) * k;
      L.y += (L.ty - L.y) * k;
      const targetR = BASE_R + (MAX_R - BASE_R) * Math.min(1, Math.max(0, still - 600) / GROW_MS);
      L.r += (targetR - L.r) * (targetR > L.r ? 0.02 : 0.2);
      el.style.setProperty('--lx', `${(L.x * 100).toFixed(2)}%`);
      el.style.setProperty('--ly', `${(L.y * 100).toFixed(2)}%`);
      el.style.setProperty('--lr', `${L.r.toFixed(1)}px`);
      const settled = Math.abs(L.tx - L.x) + Math.abs(L.ty - L.y) < 0.0005 && Math.abs(targetR - L.r) < 0.5 && still > GROW_MS + 600;
      raf = settled || document.hidden ? 0 : requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const move = (e: PointerEvent) => {
      L.tx = e.clientX / window.innerWidth;
      L.ty = e.clientY / window.innerHeight;
      L.lastMove = performance.now();
      kick();
    };
    const keys = (e: KeyboardEvent) => {
      const d = 0.04;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      const m = moves[e.key];
      if (m) {
        e.preventDefault();
        L.tx = Math.min(1, Math.max(0, L.tx + m[0]));
        L.ty = Math.min(1, Math.max(0, L.ty + m[1]));
        L.lastMove = performance.now();
        kick();
      }
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('keydown', keys);
    document.addEventListener('visibilitychange', kick);
    kick();

    // Toutes les 250 ms : qu'est-ce qui est dans la lumière ?
    const tick = window.setInterval(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const still = performance.now() - L.lastMove;
      const next = new Set<string>();
      for (const it of itemsRef.current) {
        const dx = (it.x / 100 - L.x) * w;
        const dy = (it.y / 100 - L.y) * h;
        const inLight = Math.hypot(dx, dy) < L.r * 0.8;
        if (inLight && still >= it.stillness) {
          next.add(it.id);
          reveal(it);
        }
      }
      setLit((prev) => (sameSet(prev, next) ? prev : next));
    }, 250);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(tick);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', keys);
      document.removeEventListener('visibilitychange', kick);
    };
  }, []);

  // ─── dire ─────────────────────────────────────────────
  const type = (raw: string) => {
    const ch = normalizeLetter(raw);
    if (!ch || bloom) return;
    const L = light.current;
    const id = ++letterId.current;
    setLetters((ls) => [...ls.slice(-11), { id, ch: raw.toLowerCase(), x: L.x * 100 + (Math.random() - 0.5) * 4, y: L.y * 100 + (Math.random() - 0.5) * 4 }]);
    window.setTimeout(() => setLetters((ls) => ls.filter((l) => l.id !== id)), 4200);
    audio.play('letter', { pan: (L.x - 0.5) * 0.8 });
    buffer.current = (buffer.current + ch).slice(-12);
    if (matches(buffer.current)) {
      buffer.current = '';
      speak(() => setBloom(true));
    }
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') return go('room');
      if (e.target === inputRef.current) return;
      type(e.key);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [bloom]);

  const showDots = session.phase >= 3 || !!memory.storyFlags.said;

  return (
    <div ref={rootRef} className={`void ${bloom ? 'bloom' : ''}`} aria-label="le vide">
      <div className="void-memory" aria-hidden>
        {items.map((it) =>
          revealed.has(it.id) || bloom ? <Item key={it.id} it={it} state={state} /> : null,
        )}
      </div>
      <div className="void-light">
        {items.map((it) => (
          <Item key={it.id} it={it} state={state} on={lit.has(it.id) || bloom} />
        ))}
      </div>
      <div className="void-letters" aria-hidden>
        {letters.map((l) => (
          <span key={l.id} style={{ left: `${l.x}%`, top: `${l.y}%` }}>
            {l.ch}
          </span>
        ))}
      </div>
      {showDots && (
        <button className="void-dots" aria-label="écrire" onClick={() => inputRef.current?.focus()}>
          · · · · ·
        </button>
      )}
      <input
        ref={inputRef}
        className="void-input"
        aria-label="écrire"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => {
          for (const c of e.target.value) type(c);
          e.target.value = '';
        }}
      />
      <button className="void-exit" data-cursor="object" aria-label="revenir" onClick={() => go('room')} />
    </div>
  );
}

function reveal(it: VoidItem) {
  const m = getState().memory;
  if (m.voidRevealed.includes(it.id)) return;
  updateMemory({ voidRevealed: [...m.voidRevealed, it.id] });
  audio.play('reveal', { pan: (it.x / 100 - 0.5) * 0.9 });
  if (it.clue) discover(it.clue);
}

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function Item({ it, state, on = true }: { it: VoidItem; state: Parameters<VoidItem['when']>[0]; on?: boolean }) {
  const text = typeof it.text === 'function' ? it.text(state) : it.text;
  const shape: Shape | null | undefined = typeof it.shape === 'function' ? it.shape(state) : it.shape;
  return (
    <div
      className={`v-item ${it.serif ? 'serif' : ''} ${on ? 'on' : ''}`}
      style={{ left: `${it.x}%`, top: `${it.y}%`, fontSize: it.size && text ? `${it.size}rem` : undefined }}
    >
      {text}
      {shape && <VoidShape shape={shape} size={it.size ?? 4} />}
    </div>
  );
}
