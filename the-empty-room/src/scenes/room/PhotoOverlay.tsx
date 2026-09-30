import { useEffect, useState } from 'react';
import { audio } from '../../audio/engine';
import { discover } from '../../systems/clues';
import { deriveRoom } from '../../systems/roomState';
import { updateFlags, useGame } from '../../state/store';
import { Silhouette } from './objects';

const NAMES = ['Jo', 'Inès', 'Théo', 'Cam—'];
/** Positions des quatre, dans la photo. Le quatrième regarde ailleurs. */
const SPOTS: [number, number, number][] = [
  [110, 300, 2.3],
  [185, 306, 2.15],
  [262, 298, 2.35],
  [345, 304, 2.2],
];

export function PhotoOverlay() {
  const memory = useGame((s) => s.memory);
  const session = useGame((s) => s.session);
  const room = deriveRoom({ memory, session, scene: 'room' });
  const [flipped, setFlipped] = useState(false);
  const phase = session.phase;

  useEffect(() => {
    if (phase >= 2) discover('photo-fourth');
    if (memory.visitCount >= 2) discover('photo-fading');
  }, []);

  const flip = () => {
    audio.play('paper', { level: 0.6 });
    setFlipped((f) => !f);
    if (!flipped) {
      updateFlags(() => ({ photoFlipped: true }));
      if (phase >= 2) discover('photo-date');
    }
  };

  return (
    <div className="photo" role="dialog" aria-label="photo">
      <button className={`photo-card ${flipped ? 'flipped' : ''}`} onClick={flip} aria-label="retourner la photo">
        <div className="photo-face photo-front">
          <svg viewBox="0 0 480 360" aria-hidden>
            <defs>
              <linearGradient id="afternoon" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#d9b979" />
                <stop offset="0.55" stopColor="#8a6a42" />
                <stop offset="1" stopColor="#3b2a19" />
              </linearGradient>
              <radialGradient id="sun" cx="0.8" cy="0.2" r="0.6">
                <stop offset="0" stopColor="#fff1c9" stopOpacity="0.8" />
                <stop offset="1" stopColor="#fff1c9" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="480" height="360" fill="url(#afternoon)" />
            <rect x="300" y="30" width="150" height="170" fill="#f1dca8" opacity="0.55" />
            <line x1="375" y1="30" x2="375" y2="200" stroke="#5b4328" strokeWidth="4" />
            <rect width="480" height="360" fill="url(#sun)" />
            <rect x="40" y="318" width="400" height="14" fill="#3a2716" />
            {SPOTS.map(([x, y, s], i) =>
              room.photo[i] ? (
                <g key={i} transform={i === 3 ? `rotate(-4 ${x} ${y})` : undefined}>
                  <Silhouette x={x} y={y} s={s} fill="#2a1c10" />
                </g>
              ) : (
                // Là où quelqu'un était, la lumière est restée un peu différente.
                <g key={i} opacity={0.14}>
                  <Silhouette x={x} y={y} s={s} fill="#f3dfb0" />
                </g>
              ),
            )}
            {phase >= 2 && room.photo[3] && (
              <path
                d="M318,212 C300,236 306,318 346,322 C386,326 392,238 362,214 C348,203 330,204 316,216"
                fill="none"
                stroke="#1d2a44"
                strokeWidth="2.2"
                strokeLinecap="round"
                opacity="0.8"
              />
            )}
            <rect width="480" height="360" fill="#000" opacity="0.08" />
          </svg>
        </div>
        <div className="photo-face photo-back">
          {phase >= 2 ? (
            <div className="handwriting">
              <p>17.03.24 — 17h03</p>
              <p className="names">
                {NAMES.map((n, i) => (
                  <span key={n} className={room.photo[i] ? '' : 'faded'}>
                    {n}
                    {i < NAMES.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </p>
              {room.after && <p className="late">(et toi, derrière.)</p>}
              {phase >= 3 && !room.after && <p className="corner">on reviendra.</p>}
            </div>
          ) : (
            <div className="handwriting blank" />
          )}
        </div>
      </button>
    </div>
  );
}
