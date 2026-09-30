import { useEffect, useMemo, useRef } from 'react';
import type { Atmosphere as Atmo } from '../systems/sceneEngine';
import { useQuality } from './useQuality';
import { useGame } from '../state/store';

/** Grain de pellicule : une seule texture générée, animée en CSS. */
function useGrainTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d');
    if (!g) return '';
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }, []);
}

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  p: number;
}

/**
 * Poussière dans la lumière. Canvas unique, nombre de particules selon la qualité,
 * boucle arrêtée si l'onglet est caché ou si le mouvement est réduit.
 */
export function Atmosphere({ atmo }: { atmo: Atmo }) {
  const quality = useQuality();
  const reduced = useGame((s) => s.memory.settings.reducedMotion);
  const grain = useGrainTexture();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced || atmo.dust <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.5);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const count = Math.round((quality === 'low' ? 18 : 60) * atmo.dust);
    const motes: Mote[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.4 + Math.random() * 1.3,
      vx: (Math.random() - 0.5) * 0.08,
      vy: -0.02 - Math.random() * 0.06,
      a: 0.05 + Math.random() * 0.25,
      p: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.p += dt * 0.0006;
        m.x += (m.vx + Math.sin(m.p) * 0.03) * dt * 0.06;
        m.y += m.vy * dt * 0.06;
        if (m.y < -5) m.y = h + 5;
        if (m.x < -5) m.x = w + 5;
        if (m.x > w + 5) m.x = -5;
        // Plus lumineuses dans le faisceau (en haut à gauche → bas).
        const beam = Math.max(0, 1 - Math.abs(m.x / w - (0.3 + (m.y / h) * 0.25)) * 4);
        ctx.globalAlpha = m.a * (0.25 + beam) * (0.6 + 0.4 * Math.sin(m.p * 3));
        ctx.fillStyle = '#e8e4da';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    const visibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [atmo.dust, quality, reduced]);

  return (
    <div className="atmosphere" aria-hidden>
      <div className="fog" style={{ opacity: atmo.fog }} />
      <canvas ref={canvasRef} className="dust" />
      <div className="vignette" style={{ opacity: atmo.vignette }} />
      {quality !== 'low' && (
        <div className={`grain ${reduced ? 'still' : ''}`} style={{ backgroundImage: `url(${grain})`, opacity: atmo.grain }} />
      )}
    </div>
  );
}
