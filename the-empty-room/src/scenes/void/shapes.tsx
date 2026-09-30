import type { ReactElement } from 'react';
import type { Shape } from '../../data/fragments';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Les objets de la pièce, tels que la mémoire les garde : des contours. */
export function VoidShape({ shape, size }: { shape: Shape; size: number }) {
  const px = `${size}rem`;
  if (shape === 'light') return <span className="v-light" style={{ width: px, height: px }} />;
  return (
    <svg viewBox="0 0 48 48" width={px} height={px} aria-hidden>
      {PATHS[shape]}
    </svg>
  );
}

const chair = <path {...S} d="M16 8v34M16 26h16v16M16 32h16" />;

const PATHS: Record<Exclude<Shape, 'light'>, ReactElement> = {
  chair,
  chair2: (
    <g>
      <path {...S} d="M8 10v32M8 26h12v16" />
      <path {...S} d="M40 10v32M40 26H28v16" />
    </g>
  ),
  clock: (
    <g>
      <circle {...S} cx={24} cy={24} r={16} />
      <path {...S} d="M24 24l5 2M24 24l-1-12" />
    </g>
  ),
  phone: <rect {...S} x={16} y={8} width={16} height={32} rx={3} />,
  cup: <path {...S} d="M14 18h18l-2 18H16zM32 22c6 0 6 8 0 8" />,
  cup2: <path {...S} d="M14 18h18l-2 18H16zM32 22c6 0 6 8 0 8" />,
  door: <path {...S} d="M14 42V6h20v36M30 25h.5" />,
  window: <path {...S} d="M8 8h32v28H8zM24 8v28M8 22h32" />,
  plant: <path {...S} d="M18 42h12l2-12H16zM24 30c0-8-6-12-10-14M24 30c0-10 4-14 10-16M24 30V14" />,
  lamp: <path {...S} d="M16 14h16l-4-8h-8zM24 14v28M18 42h12" />,
  photo: (
    <g>
      <rect {...S} x={6} y={10} width={36} height={28} />
      {[13, 20, 27, 34].map((x, i) => (
        <circle key={x} {...S} cx={x} cy={24} r={2.2} opacity={i === 3 ? 1 : 0.4} />
      ))}
    </g>
  ),
  figure: <path {...S} d="M20 46V24c-2-4 0-8 4-8 4 0 6 4 4 8v22M24 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />,
};
