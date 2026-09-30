import { useEffect, useRef } from 'react';
import { PhoneOverlay } from '../scenes/room/PhoneOverlay';
import { PhotoOverlay } from '../scenes/room/PhotoOverlay';
import { updateSession, useGame } from '../state/store';

/** Les gros plans. On en sort en cliquant à côté, ou avec Échap. */
export function Overlay() {
  const overlay = useGame((s) => s.session.overlay);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overlay) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && updateSession({ overlay: null });
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      previous?.focus?.();
    };
  }, [overlay]);

  if (!overlay) return null;
  return (
    <div
      ref={ref}
      className="overlay"
      tabIndex={-1}
      data-cursor="object"
      onClick={(e) => e.target === e.currentTarget && updateSession({ overlay: null })}
    >
      {overlay === 'phone' && <PhoneOverlay />}
      {overlay === 'photo' && <PhotoOverlay />}
      <button className="overlay-close" aria-label="fermer" onClick={() => updateSession({ overlay: null })} />
    </div>
  );
}
