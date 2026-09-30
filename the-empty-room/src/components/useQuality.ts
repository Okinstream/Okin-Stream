import { useGame } from '../state/store';
import { guessLowQuality } from '../utils/dom';

const guessed = guessLowQuality() ? 'low' : 'high';

export function useQuality(): 'low' | 'high' {
  const q = useGame((s) => s.memory.settings.quality);
  return q === 'auto' ? guessed : q;
}
