# the empty room

Une expérience. Pas un site.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ statique, déployable n'importe où
npm run typecheck
```

## Pour le développement

| Paramètre d'URL | Effet |
|---|---|
| `?oublier` | efface la mémoire locale (la pièce vous oublie) |
| `?visite=4` | *(dev uniquement)* force le numéro de visite |

En dev, chaque indice découvert s'affiche dans la console (`[indice] …`). Jamais en production.

## Structure

```
src/
  state/       store central persistant (localStorage « salle.03:17 »)
  systems/     session, scènes, indices, attention, présence, pièce, téléphone
  scenes/      registry.ts + room/ corridor/ void/
  components/  curseur, atmosphère, transitions, gros plans, réglages
  puzzles/     la clé (hachée)
  audio/       moteur Web Audio procédural + partition
  data/        indices, messages, fragments du vide, mises en page
docs/
  CONCEPTION.md   vision, systèmes, plan
  BIBLE.md        toutes les réponses — à ne pas publier
```

### Ajouter une scène

1. Créer `src/scenes/ma-scene/MaScene.tsx` (export par défaut).
2. Ajouter un `defineScene({ id, load, atmosphere, audio, audioMode })` dans `src/scenes/registry.ts`.
3. Ajouter l'identifiant au type `SceneId`.
4. Y aller avec `go('ma-scene')`.

### Ajouter un indice

Ajouter une entrée dans `src/data/clues.ts` (le champ `meaning`, sur une ligne entre guillemets doubles, est retiré du build), puis appeler `discover('id')` là où le visiteur le trouve.

## Choix techniques

- SVG + Canvas 2D + CSS : pas de WebGL, donc pas de fallback nécessaire, et une pièce nette à toutes les tailles.
- Aucune bibliothèque d'animation ; les boucles `requestAnimationFrame` s'arrêtent quand rien ne bouge ou que l'onglet est caché.
- Son 100 % synthétisé : aucun fichier audio, aucune licence.
- Aucune donnée ne quitte le navigateur.
- Accessibilité : réglages (point en bas à droite), `M` pour couper le son, navigation clavier (Tab / Entrée / Échap, flèches dans le couloir et le vide), respect de `prefers-reduced-motion`, mode image « légère ».
