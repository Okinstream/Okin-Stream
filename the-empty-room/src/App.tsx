import { Suspense, useEffect } from 'react';
import './scenes/registry';
import { audio } from './audio/engine';
import { Atmosphere } from './components/Atmosphere';
import { Cursor } from './components/Cursor';
import { Overlay } from './components/Overlay';
import { Settings } from './components/Settings';
import { Transition } from './components/Transition';
import { understanding } from './systems/clues';
import { usePresence } from './systems/presence';
import { getScene } from './systems/sceneEngine';
import { getState, subscribe, updateMemory, updateSession, useGame } from './state/store';
import { setFavicon } from './utils/dom';
import { isMirrorMinute } from './utils/time';

const INTRO = 3170;

function useAudioSync() {
  useEffect(() => {
    const wake = () => {
      audio.wake();
      const { volume, muted } = getState().memory.settings;
      audio.setVolume(volume, muted);
      updateSession({ audioAwake: true });
    };
    let last = '';
    const apply = () => {
      const s = getState();
      const targets = getScene(s.scene).audio(s);
      const key = JSON.stringify(targets);
      if (key !== last) {
        last = key;
        audio.setLayers(targets, 3.5);
      }
      audio.setDensity(understanding(s) / 14);
    };
    const keys = (e: KeyboardEvent) => {
      const s = getState();
      if (e.key.toLowerCase() !== 'm' || s.scene === 'void' || e.metaKey || e.ctrlKey) return;
      const settings = { ...s.memory.settings, muted: !s.memory.settings.muted };
      updateMemory({ settings });
      audio.setVolume(settings.volume, settings.muted);
    };
    apply();
    const unsub = subscribe(apply);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('keydown', keys);
    return () => {
      unsub();
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('keydown', keys);
    };
  }, []);
}

export function App() {
  const scene = useGame((s) => s.scene);
  const entered = useGame((s) => s.session.sceneEnteredAt);
  const reduced = useGame((s) => s.memory.settings.reducedMotion);
  const def = getScene(scene);
  const Scene = def.component;

  useEffect(() => {
    const t = window.setTimeout(() => updateSession({ introDone: true }), INTRO);
    if (getState().memory.storyFlags.said) setFavicon('/chaise-2.svg');
    if (isMirrorMinute()) console.log('%ctu es là ?', 'color:#6b7686;font:italic 14px Georgia,serif');
    return () => window.clearTimeout(t);
  }, []);

  usePresence();
  useAudioSync();

  return (
    <main className={`stage scene-${scene} ${reduced ? 'reduced' : ''}`}>
      <Suspense fallback={null}>
        <Scene key={entered} />
      </Suspense>
      <Atmosphere atmo={def.atmosphere} />
      <Overlay />
      <Transition />
      <Settings />
      <Cursor />
    </main>
  );
}
