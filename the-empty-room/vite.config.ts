import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Les indices portent un champ `meaning` qui sert à organiser le projet.
 * Il ne doit jamais atteindre le navigateur : on le retire du build.
 * Convention : `meaning: '…',` tient sur une seule ligne.
 */
function stripMeaning(): Plugin {
  return {
    name: 'strip-meaning',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/src[\\/]data[\\/]clues\.ts$/.test(id)) return null;
      return { code: code.replace(/^\s*meaning:\s*(['"`]).*\1,?\s*$/gm, ''), map: null };
    },
  };
}

export default defineConfig({
  plugins: [stripMeaning(), react()],
  build: { sourcemap: false, target: 'es2022' },
});
