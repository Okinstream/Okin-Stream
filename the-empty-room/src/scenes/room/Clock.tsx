import { useEffect, useRef, useState } from 'react';
import { audio } from '../../audio/engine';
import { discover } from '../../systems/clues';
import type { ClockBase } from '../../systems/roomState';
import { getState, updateSession } from '../../state/store';
import { isMirrorMinute } from '../../utils/time';

/** 03:17:22, en secondes depuis minuit. */
export const STUCK = 3 * 3600 + 17 * 60 + 22;
const KEEP_RUNNING = 17; // secondes de marche après qu'on a cessé de la regarder
const GLITCH_AT = 197; // visite 1 : 3 min 17 s après l'arrivée

const nowSeconds = () => {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
};

/**
 * L'horloge.
 * - réelle : suit l'heure, sauf une fois, 17 secondes, à 03:17 ;
 * - figée : 03:17:22, la trotteuse hésite ; ne repart que sous le regard,
 *   continue 17 s quand on détourne les yeux, puis revient ;
 * - morte : figée, plus rien n'hésite.
 */
export function useClock(base: ClockBase, observed: boolean) {
  const [sec, setSec] = useState(() => (base === 'real' ? nowSeconds() : STUCK));
  const runRef = useRef({ running: false, since: 0, value: STUCK, idle: 0, watched: 0, everRan: false });
  const observedRef = useRef(observed);
  observedRef.current = observed;

  useEffect(() => {
    let odd = false;
    const id = window.setInterval(() => {
      const r = runRef.current;
      odd = !odd;
      const hidden = document.hidden;
      const sinceStart = (Date.now() - getState().session.startedAt) / 1000;

      if (isMirrorMinute() || base === 'real') {
        const glitch = base === 'real' && getState().memory.visitCount <= 1 && sinceStart >= GLITCH_AT && sinceStart < GLITCH_AT + 17;
        if (glitch && !isMirrorMinute()) {
          if (observedRef.current) discover('clock-0317');
          setSec(STUCK);
          updateSession({ clockRunning: false });
          audio.play('hesitate');
          return;
        }
        setSec(nowSeconds());
        updateSession({ clockRunning: true });
        audio.play(odd ? 'tick' : 'tock');
        return;
      }

      if (base === 'dead') {
        setSec(STUCK);
        updateSession({ clockRunning: false });
        return;
      }

      // figée
      if (observedRef.current && !hidden) {
        r.watched += 1;
        if (!r.running) {
          discover('clock-0317');
          discover('clock-22');
        }
        r.idle = 0;
        if (!r.running && r.watched >= 2) {
          r.running = true;
          r.value = STUCK;
          if (r.everRan) discover('clock-observed');
          r.everRan = true;
        }
      } else {
        r.watched = 0;
        if (r.running) r.idle += 1;
        if (r.running && (r.idle >= KEEP_RUNNING || hidden)) {
          r.running = false;
          r.idle = 0;
          audio.play('rewind');
          discover('clock-returns');
        }
      }

      if (r.running) {
        r.value += 1;
        setSec(r.value);
        audio.play(odd ? 'tick' : 'tock');
      } else {
        // La trotteuse essaie d'avancer, et retombe.
        setSec(odd ? STUCK : STUCK - 1);
        if (odd) audio.play('hesitate', { level: 0.8 });
      }
      updateSession({ clockRunning: r.running });
    }, 1000);
    return () => window.clearInterval(id);
  }, [base]);

  return sec;
}

export function ClockFace({ r, sec, dead }: { r: number; sec: number; dead: boolean }) {
  const h = ((sec / 3600) % 12) * 30;
  const m = ((sec / 60) % 60) * 6;
  const s = (sec % 60) * 6;
  return (
    <g>
      <circle r={r + 5} fill="#0b0f16" stroke="rgba(190,205,230,0.25)" strokeWidth={1} />
      <circle r={r} fill="url(#clockFace)" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1={0}
          y1={-r + 3}
          x2={0}
          y2={-r + (i % 3 === 0 ? 9 : 6)}
          stroke="#2c3038"
          strokeWidth={i % 3 === 0 ? 1.8 : 1}
          transform={`rotate(${i * 30})`}
        />
      ))}
      <line x1={0} y1={3} x2={0} y2={-r * 0.5} stroke="#1c1f25" strokeWidth={2.6} strokeLinecap="round" transform={`rotate(${h})`} />
      <line x1={0} y1={4} x2={0} y2={-r * 0.76} stroke="#1c1f25" strokeWidth={1.7} strokeLinecap="round" transform={`rotate(${m})`} />
      {!dead && (
        <line
          className="second-hand"
          x1={0}
          y1={6}
          x2={0}
          y2={-r * 0.86}
          stroke="#4a3a2a"
          strokeWidth={0.8}
          transform={`rotate(${s})`}
        />
      )}
      <circle r={1.8} fill="#1c1f25" />
    </g>
  );
}
