import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { audio } from '../../audio/engine';
import { TALL, WIDE, type RoomLayout } from '../../data/layout';
import { touch, useAttention } from '../../systems/attention';
import { discover } from '../../systems/clues';
import { answerCall, usePhoneEvents } from '../../systems/phoneEvents';
import { deriveRoom } from '../../systems/roomState';
import { go } from '../../systems/sceneEngine';
import { getState, updateFlags, updateSession, useGame } from '../../state/store';
import type { ObjectId } from '../../state/types';
import { useParallax } from '../../components/useParallax';
import { ClockFace, useClock } from './Clock';
import { Chair, Cup, Door, Lamp, Phone, PhotoFrame, Plant, Table, Window } from './objects';
import { RoomDefs } from './RoomDefs';

function useLayout(): RoomLayout {
  const query = '(max-aspect-ratio: 4/5)';
  const [tall, setTall] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setTall(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return tall ? TALL : WIDE;
}

interface ObjProps {
  id: ObjectId;
  label: string;
  cursor?: 'object' | 'pseudo';
  onActivate?: () => void;
  transform?: string;
  className?: string;
  children: ReactNode;
  /** Zone de clic élargie (utile au doigt). */
  hit?: { x: number; y: number; w: number; h: number };
  onHover?: (on: boolean) => void;
}

function Obj({ id, label, cursor = 'object', onActivate, transform, className, children, hit, onHover }: ObjProps) {
  const att = useAttention(id);
  return (
    <g
      className={`obj ${className ?? ''}`}
      data-cursor={cursor}
      role="button"
      tabIndex={0}
      aria-label={label}
      transform={transform}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate?.();
        }
      }}
      onPointerEnter={() => {
        att.onPointerEnter();
        onHover?.(true);
      }}
      onPointerLeave={() => {
        att.onPointerLeave();
        onHover?.(false);
      }}
      onFocus={() => {
        att.onFocus();
        onHover?.(true);
      }}
      onBlur={() => {
        att.onBlur();
        onHover?.(false);
      }}
    >
      {hit && <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" />}
      {children}
    </g>
  );
}

export default function Room() {
  const L = useLayout();
  const memory = useGame((s) => s.memory);
  const session = useGame((s) => s.session);
  const room = useMemo(() => deriveRoom({ memory, session, scene: 'room' }), [memory, session]);
  const [clockSeen, setClockSeen] = useState(false);
  const [rattle, setRattle] = useState(false);
  const sec = useClock(room.clock, clockSeen);
  const rootRef = useRef<HTMLDivElement>(null);
  useParallax(rootRef);
  usePhoneEvents();

  const figure = session.idle && session.phase >= 2 && !room.after && !room.emptied;
  const phoneGlow = !!session.notification || session.call === 'ringing';
  const tall = L.kind === 'tall';

  useEffect(() => {
    if (room.cup2 !== 'none') discover('cup-second');
  }, [room.cup2]);

  // ─── interactions ──────────────────────────────────────
  const openPhone = () => {
    touch('phone');
    if (getState().session.call === 'ringing') answerCall();
    updateFlags((f) => ({ phoneOpens: (f.phoneOpens ?? 0) + 1 }));
    updateSession({ overlay: 'phone', phoneOpenedHere: true });
    audio.play('paper', { level: 0.4 });
  };

  const openDoor = () => {
    touch('door');
    const s = getState();
    const r = deriveRoom(s);
    if (!r.doorAjar) {
      audio.play('locked', { pan: 0.4 });
      setRattle(true);
      window.setTimeout(() => setRattle(false), 700);
      return;
    }
    audio.play('door', { pan: 0.4 });
    const since = Date.now() - s.session.sceneEnteredAt;
    const record = (o: string) =>
      updateFlags((f) => ({ doorOutcomes: [...(f.doorOutcomes ?? []), o].slice(-17) }));

    if (!r.after && s.memory.visitCount >= 2 && since < 10_000) {
      // Trop tôt : la porte ramène ici même.
      record('same');
      discover('door-same');
      updateSession({ loops: s.session.loops + 1 });
      go('room', { out: 2200, in: 2600 });
    } else if (!r.after && s.session.phase >= 2 && !s.session.clockRunning) {
      record('void');
      discover('door-void');
      go('void', { out: 2600, in: 3400 });
    } else {
      record('corridor');
      go('corridor');
    }
  };

  const toggleLamp = () => {
    touch('lamp');
    audio.play('switch', { pan: -0.6 });
    updateFlags((f) => ({ lampOff: !f.lampOff }));
    if (room.lampRelit) discover('lamp-relit');
  };

  const touchEmptyChair = () => {
    // Rien ne se passe. La pièce, elle, s'en souvient.
    touch('chair2');
    updateFlags((f) => ({ emptyChairTouches: (f.emptyChairTouches ?? 0) + 1 }));
  };

  const cup2Click = () => {
    touch('cup2');
    if (room.cup2 === 'warm') {
      audio.play('steam');
      discover('cup-warm');
    } else if (room.cup2 === 'broken') {
      audio.play('crack', { level: 0.3 });
      discover('cup-broken');
    } else audio.play('clink', { level: 0.6 });
  };

  const windowClick = () => {
    touch('window');
    if (figure) discover('window-figure');
    updateSession({ idle: false });
  };

  // ─── géométrie ─────────────────────────────────────────
  const { wall: W, vp } = L;
  const far = { x0: -400, x1: L.w + 400, yTop: -300, yBot: L.h + 200 };
  const boards = useMemo(() => {
    const lines: string[] = [];
    for (let i = 0; i <= L.boards; i++) {
      const xb = W.x0 + ((W.x1 - W.x0) * i) / L.boards;
      const t = (far.yBot - vp.y) / (W.y1 - vp.y);
      lines.push(`M${xb},${W.y1} L${vp.x + (xb - vp.x) * t},${far.yBot}`);
    }
    return lines.join(' ');
  }, [L, W, vp, far.yBot]);

  const chair2 = room.after ? L.chair2After : L.chair2;
  const chair2X = room.after ? chair2.x : chair2.x - room.chair2Advance * (tall ? 0.55 : 1);
  const chair1X = L.chair.x + room.loops * 3;

  const focusAt: Partial<Record<ObjectId, [number, number]>> = {
    clock: [L.clock.x, L.clock.y],
    phone: [L.table.x, L.table.y],
    cup: [L.table.x - 38 * L.table.s, L.table.y],
    cup2: [L.table.x + 44 * L.table.s, L.table.y],
    chair: [chair1X, L.chair.y - 90 * L.chair.s],
    chair2: [chair2X, chair2.y - 90 * chair2.s],
    window: [L.window.x + L.window.w / 2, L.window.y + L.window.h / 2],
    door: [L.door.x + L.door.w / 2, L.door.y + L.door.h / 2],
    photo: [L.photo.x + 29, L.photo.y + 22],
    plant: L.plant ? [L.plant.x, L.plant.y - 40] : undefined,
    lamp: L.lamp ? [L.lamp.x, L.lamp.y - 420 * L.lamp.s] : undefined,
  };
  const focus = room.focus ? focusAt[room.focus] : undefined;

  const scene = (
    <>
      {/* ── plan du fond ── */}
      <g className="layer layer-back">
        <rect x={far.x0} y={far.yTop} width={far.x1 - far.x0} height={far.yBot - far.yTop} fill="#05070b" />
        <polygon points={`${W.x0},${W.y0} ${W.x1},${W.y0} ${far.x1},${far.yTop} ${far.x0},${far.yTop}`} fill="url(#ceiling)" />
        <polygon points={`${W.x0},${W.y0} ${W.x0},${W.y1} ${far.x0},${far.yBot} ${far.x0},${far.yTop}`} fill="url(#wallLeft)" />
        <polygon points={`${W.x1},${W.y0} ${W.x1},${W.y1} ${far.x1},${far.yBot} ${far.x1},${far.yTop}`} fill="url(#wallRight)" />
        <polygon points={`${W.x0},${W.y1} ${W.x1},${W.y1} ${far.x1},${far.yBot} ${far.x0},${far.yBot}`} fill="url(#floor)" />
        <path d={boards} stroke="rgba(200,215,240,0.03)" strokeWidth={1} />
        <rect x={W.x0} y={W.y0} width={W.x1 - W.x0} height={W.y1 - W.y0} fill="url(#backWall)" />
        {!tall && <rect x={W.x0} y={W.y1 - 12} width={W.x1 - W.x0} height={12} fill="#0a0e15" />}

        <Obj id="window" label="fenêtre" onActivate={windowClick} transform={`translate(${L.window.x},${L.window.y})`}>
          <Window
            w={L.window.w}
            h={L.window.h}
            rain={room.rain}
            open={room.windowOpen}
            figure={figure}
            opposite={figure || room.lampRelit || room.after}
          />
        </Obj>

        <Obj
          id="clock"
          label="horloge"
          onActivate={() => touch('clock')}
          onHover={setClockSeen}
          transform={`translate(${L.clock.x},${L.clock.y})`}
          hit={{ x: -L.clock.r - 14, y: -L.clock.r - 14, w: L.clock.r * 2 + 28, h: L.clock.r * 2 + 28 }}
        >
          <ClockFace r={L.clock.r} sec={sec} dead={room.clock === 'dead'} />
        </Obj>

        <Obj
          id="photo"
          label="photo"
          onActivate={() => {
            touch('photo');
            audio.play('paper', { level: 0.5 });
            updateSession({ overlay: 'photo' });
          }}
          transform={`translate(${L.photo.x},${L.photo.y}) scale(${L.photo.s})`}
          hit={{ x: -10, y: -10, w: 78, h: 64 }}
        >
          <PhotoFrame people={room.photo} />
        </Obj>

        <Obj id="door" label="porte" className={rattle ? 'rattle' : undefined} onActivate={openDoor} transform={`translate(${L.door.x},${L.door.y})`}>
          <Door w={L.door.w} h={L.door.h} ajar={room.doorAjar} />
        </Obj>
        {room.doorAjar && (
          <polygon
            points={`${L.door.x + L.door.w - 6},${W.y1} ${L.door.x + L.door.w},${W.y1} ${L.door.x + L.door.w + 60},${W.y1 + 90} ${L.door.x + L.door.w + 10},${W.y1 + 90}`}
            fill="url(#doorSpill)"
            pointerEvents="none"
          />
        )}

        {L.plant && (
          <Obj id="plant" label="plante" onActivate={() => { touch('plant'); audio.play('paper', { level: 0.25, pan: -0.5 }); }} transform={`translate(${L.plant.x},${L.plant.y}) scale(${L.plant.s})`} hit={{ x: -40, y: -110, w: 80, h: 115 }}>
            <Plant leaves={room.plantLeaves} fallen={room.fallenLeaves} />
          </Obj>
        )}
      </g>

      {/* ── lumière ── */}
      <g className="layer layer-light" pointerEvents="none">
        <polygon points={L.moonShaft} fill="url(#moonShaft)" filter="url(#soft)" className="shaft" />
        <polygon points={L.moonPatch} fill="url(#moonPatch)" filter="url(#soft)" />
        {room.lampOn && (
          <ellipse cx={L.lampPool.x} cy={L.lampPool.y} rx={L.lampPool.rx} ry={L.lampPool.ry} fill="url(#lampPool)" className="flicker" />
        )}
        {focus && <circle cx={focus[0]} cy={focus[1]} r={110} fill="url(#focusGlow)" className="breathe-slow" />}
      </g>

      {/* ── plan moyen ── */}
      <g className="layer layer-mid">
        <Obj
          id="chair2"
          label="chaise"
          cursor="pseudo"
          onActivate={touchEmptyChair}
          onHover={(on) => on && discover('chair-moves')}
          transform={`translate(${chair2X},${chair2.y}) scale(${-chair2.s},${chair2.s})`}
          hit={{ x: -50, y: -190, w: 110, h: 195 }}
        >
          <g opacity={room.chair2Opacity}>
            <Chair ghost={!room.after} />
          </g>
        </Obj>

        <g transform={`translate(${chair1X},${L.chair.y}) scale(${L.chair.s})`} data-cursor="none">
          <Chair />
        </g>

        <g transform={`translate(${L.table.x},${L.table.y}) scale(${L.table.s})`}>
          <Table />
          <Obj id="cup" label="tasse" onActivate={() => { touch('cup'); audio.play('clink'); }} transform="translate(-40,-2)" hit={{ x: -16, y: -26, w: 34, h: 30 }}>
            <Cup state={room.after ? 'warm' : 'mine'} />
          </Obj>
          {room.cup2 !== 'none' && (
            <Obj id="cup2" label="tasse" onActivate={cup2Click} transform="translate(46,-5)" className="appear" hit={{ x: -16, y: -26, w: 34, h: 30 }}>
              <Cup state={room.cup2} />
            </Obj>
          )}
          <Obj id="phone" label="téléphone" onActivate={openPhone} transform="translate(-2,6)" hit={{ x: -28, y: -14, w: 56, h: 26 }}>
            <Phone glow={phoneGlow} ringing={session.call === 'ringing'} />
          </Obj>
        </g>
      </g>

      {/* ── premier plan ── */}
      <g className="layer layer-front">
        {L.lamp && (
          <Obj id="lamp" label="lampe" onActivate={toggleLamp} transform={`translate(${L.lamp.x},${L.lamp.y}) scale(${L.lamp.s})`} hit={{ x: -50, y: -470, w: 100, h: 110 }}>
            <Lamp on={room.lampOn} />
          </Obj>
        )}
        {!room.lampOn && <rect x={far.x0} y={far.yTop} width={far.x1 - far.x0} height={far.yBot - far.yTop} fill="#000" opacity={0.28} pointerEvents="none" />}
      </g>
    </>
  );

  return (
    <div ref={rootRef} className={`room ${room.emptied ? 'emptied' : ''} ${room.after ? 'after' : ''}`}>
      <svg
        className="room-svg"
        viewBox={`0 0 ${L.w} ${L.h}`}
        preserveAspectRatio="xMidYMid slice"
        aria-label="une pièce"
      >
        <RoomDefs />
        {room.mirrored ? <g transform={`translate(${L.w},0) scale(-1,1)`}>{scene}</g> : scene}
      </svg>
    </div>
  );
}
