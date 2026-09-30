import { useGame } from '../state/store';

const INTRO_FADE = 6000;

/** Le noir entre deux lieux. Parfois du blanc. */
export function Transition() {
  const t = useGame((s) => s.session.transition);
  const intro = useGame((s) => s.session.introDone);
  const opaque = !intro || t?.stage === 'out';
  const tone = t?.tone ?? 'black';
  const ms = t ? t.ms : INTRO_FADE;
  return (
    <div
      className={`transition ${tone} ${opaque ? 'opaque' : ''}`}
      style={{ transitionDuration: `${ms}ms` }}
      aria-hidden
    />
  );
}
