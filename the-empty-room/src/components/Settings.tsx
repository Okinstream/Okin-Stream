import { useState } from 'react';
import { audio } from '../audio/engine';
import { updateMemory, useGame } from '../state/store';
import type { Settings as S } from '../state/types';

/** Un point, en bas. Rien d'autre ne ressemble à une interface. */
export function Settings() {
  const settings = useGame((s) => s.memory.settings);
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<S>) => {
    const next = { ...settings, ...patch };
    updateMemory({ settings: next });
    audio.setVolume(next.volume, next.muted);
  };

  return (
    <div className={`settings ${open ? 'open' : ''}`}>
      <button className="settings-dot" aria-label="réglages" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="settings-panel" role="group" aria-label="réglages">
          <label>
            son
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.volume}
              onChange={(e) => set({ volume: Number(e.target.value) })}
            />
          </label>
          <label>
            <input type="checkbox" checked={settings.muted} onChange={(e) => set({ muted: e.target.checked })} />
            silence
          </label>
          <label>
            <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} />
            moins de mouvement
          </label>
          <label>
            image
            <select value={settings.quality} onChange={(e) => set({ quality: e.target.value as S['quality'] })}>
              <option value="auto">auto</option>
              <option value="high">fine</option>
              <option value="low">légère</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
