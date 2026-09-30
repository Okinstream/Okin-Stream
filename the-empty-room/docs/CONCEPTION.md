# THE EMPTY ROOM — document de conception

> Ce document décrit l'intention, les systèmes et l'architecture.
> Les réponses (ce que les choses *veulent dire*) sont dans `BIBLE.md`, à ne pas publier.

---

## 1. Vision globale

Une seule pièce, la nuit. Une chaise, une table, un téléphone, une tasse, une horloge, une fenêtre, une porte, une plante, une photo, une lampe.
Rien ne dit quoi faire. Rien ne dit ce que c'est.

Le site repose sur trois idées :

1. **Le vide est plein.** L'absence n'est pas « rien » : c'est un espace saturé de ce qui manque. Plus on regarde le noir, plus il se remplit.
2. **Le temps n'avance que si on le regarde.** L'horloge est bloquée ; elle ne repart que sous l'observation. C'est le deuil, l'attente, la fixation — et aussi une règle de jeu.
3. **Le visiteur est le personnage.** Ses absences réelles (le temps entre deux visites), ses hésitations, ce qu'il ignore et ce qu'il regarde longtemps deviennent la matière de l'histoire. La deuxième chaise, c'est peut-être lui.

Trajectoire émotionnelle voulue :
*« C'est magnifique » → « C'est bizarre » → « Attends… » → « Pourquoi ça a changé ? » → « Il y a quelque chose derrière » → « Je n'avais pas compris ce que je regardais. »*

## 2. Structure narrative

Il n'y a pas de récit, il y a des **couches** :

| Couche | Ce que perçoit le visiteur | Quand |
|---|---|---|
| Surface | une pièce belle et triste | immédiatement |
| Anomalie | l'horloge revient à 03:17, un objet a bougé | 1 à 30 min |
| Mémoire | la pièce se souvient de lui (tasses, plante, lampe) | 2ᵉ visite |
| Réseau | 03:17 / 17:03 / 17.03 / 22 / 4 / S reviennent partout | 3ᵉ visite+ |
| Clé | combiner des indices de plusieurs lieux | long terme |
| Retournement | la scène initiale se relit depuis l'autre chaise | après la clé |

Les dates se contredisent volontairement (2024 / 2025). Les messages sont incomplets, certains impossibles (datés dans le futur, envoyés depuis son propre numéro). Aucune source ne dit la vérité en entier.

Deux fins, aucune annoncée :
- **Dire** — trouver le mot et le prononcer dans le vide. La pièce revient, vue depuis l'autre côté.
- **Se taire** — revenir encore et encore sans jamais le dire. Les autres disparaissent, puis la pièce se vide pour de bon.

## 3. Structure des scènes

```
            ┌──────────── porte (règle cachée) ────────────┐
            │                                              │
   [PIÈCE] ─┼─ trop tôt ──────────────▶ [PIÈCE] (même)     │
            ├─ temps en marche ───────▶ [COULOIR] ─ 322 ──▶ [VIDE]
            └─ temps arrêté ──────────▶ [VIDE]              │
                                          ▲                 │
   [COULOIR] ─ porte du fond ─▶ [PIÈCE]   └──── clé ──────▶ [PIÈCE retournée]
```

- **Pièce** — le cœur. Évolue selon la visite, les actions, le temps réel.
- **Couloir** — la recherche. S'allonge avec le temps. Une silhouette recule. Des pas s'arrêtent derrière soi.
- **Vide** — l'absence. Noir. Une lumière suit le regard ; l'immobilité révèle. Ce qui a été vu reste, faiblement, d'une visite à l'autre.

Chaque scène est une entrée de registre (`src/scenes/registry.ts`) chargée en lazy.

## 4. Systèmes

| Système | Rôle |
|---|---|
| `state/store` | état central persistant (localStorage), abonnement React |
| `systems/session` | visites, absences, phase, temps passé, battement |
| `systems/sceneEngine` | navigation, transitions lentes, atmosphère |
| `systems/clues` | registre d'indices, conditions, dépendances, découverte |
| `systems/attention` | mesure le temps passé sur chaque objet |
| `systems/presence` | inactivité, onglet caché, titre du document |
| `systems/clock` | horloge : réelle / figée / observée / rapide |
| `systems/roomState` | dérive l'état de la pièce depuis la mémoire |
| `puzzles/key` | vérification de la clé (hachée, jamais en clair) |
| `audio/engine` | Web Audio procédural, couches réactives |
| `components/Atmosphere` | poussière, grain, brume (canvas, qualité adaptative) |
| `components/Cursor` | curseur organique, états selon la cible |

## 5. Symboles

| Symbole | Rôle en surface | Rôle possible (volontairement multiple) |
|---|---|---|
| Horloge | décor | le temps figé, une heure précise, une règle de navigation |
| Deuxième tasse | détail | une présence, une attente, un rituel, une perte |
| Deuxième chaise | presque invisible | l'autre, ou le visiteur lui-même |
| Téléphone | notifications | ce qui n'a pas été dit / pas entendu |
| Porte | sortie | l'espace intérieur n'est pas fiable |
| Fenêtre | extérieur | le monde continue ; quelqu'un en face, parfois |
| Plante | décor | le temps réel qui passe entre deux visites |
| Lampe | lumière | la lumière qu'on laisse allumée pour quelqu'un |
| Photo | souvenir | les autres, qui disparaissent un par un |
| Le vide | noir | l'absence, pleine |

## 6. Puzzles

Du plus simple au plus difficile (solutions dans `BIBLE.md`) :

1. **L'horloge revient.** Observer, détourner le regard, observer.
2. **Le temps sous le regard.** Comprendre que l'horloge ne tourne que si on la regarde.
3. **La porte.** Elle ne mène pas toujours au même endroit. Il y a une règle.
4. **Les messages manquants.** Remonter la conversation ; comprendre ce qui manque.
5. **La fenêtre d'en face.** Quelqu'un n'apparaît que lorsqu'on ne bouge plus.
6. **La chaise qui avance.** Ne se voit qu'en comparant des captures entre visites.
7. **Le couloir trop long.** Une porte n'a pas de numéro mais une lettre ; elle n'existe que si le couloir est assez long.
8. **Le vide.** Rester immobile révèle. Ce qui est révélé reste.
9. **La clé.** Une heure (pièce) + un nombre (téléphone) + une position (photo) + une lettre (couloir) + une phrase (vide). Personne ne dit qu'il faut combiner.
10. **L'écho.** Des indices techniques : source HTML, `robots.txt`, un fichier JSON, le titre de l'onglet, le favicon, la console à certaines heures réelles.

## 7. Mémoire du site

Tout est local (`localStorage`, clé `salle.03:17`). Aucune donnée personnelle, aucun réseau.

Mémorisé : nombre de visites, heures des visites, temps passé, scènes visitées, indices découverts, interactions par objet, temps d'attention par objet, éléments révélés dans le vide, drapeaux narratifs (appel ignoré, lampe éteinte, fin atteinte…), santé de la plante, réglages.

Une **visite** = un retour après plus de 10 minutes d'absence.
La **phase** = nombre de visites, avec un bonus (max +2) pour les longues sessions — une personne très patiente peut aller loin en une seule nuit, mais certaines choses exigent de revenir.

Ce que la pièce « dit » sans le dire :
- tasse chaude si retour en moins de 3 h, froide sinon, absente après une semaine, cassée si un appel a été ignoré ;
- la plante perd des feuilles selon les jours d'absence réels, en regagne si on revient souvent ;
- l'objet le plus regardé reçoit une lumière à la visite suivante ;
- les heures des visites du visiteur apparaissent dans le vide ;
- l'onglet caché change de titre.

## 8. Direction artistique

- Palette : noir `#05070b`, bleu nuit `#0b1220`, gris froid `#6b7686`, blanc cassé `#e8e4da`. Doré `#c9a45c` pour la lampe et l'aube. Rouge `#8a2b2b` **une seule fois** : l'appel manqué.
- Perspective centrale, cadrage de cinéma, lumière de lune en diagonale, lampe chaude, brume, grain de pellicule, vignette.
- Mouvement : respiration de caméra (17,03 s), parallaxe de quelques pixels, poussière dans le faisceau, pluie dans la vitre.
- Typographie : une serif fine (Cormorant Garamond) pour les fragments, une sans neutre (Inter) pour le téléphone.
- Mobile : composition verticale propre, plus abstraite (moins d'objets, plus de noir), pas une réduction du desktop.
- Aucun glitch gratuit, aucun jumpscare, aucune apparition brutale. Tout arrive lentement.

## 9. Direction sonore

Entièrement **procédurale** (Web Audio), donc originale et sans licence :

- *drone* : deux oscillateurs désaccordés filtrés, souffle de pièce ;
- *pluie* : bruit filtré, n'existe que lorsqu'il pleut ;
- *horloge* : tic réel ; quand elle est figée, le tic hésite (tic… tic-tic) ;
- *ballade* : progression Ré mineur (i–VI–III–VII) très lente, piano de synthèse + nappe, réverbération générée. Elle devient audible à mesure que le visiteur découvre des choses ;
- *ponctuels* : pas, porte, vibration, tasse, papier, lettres dans le vide ;
- *silences* : le vide est presque muet — chaque révélation y produit une note.

Démarre au premier geste (politique d'autoplay), réglable, coupable (touche `M`).

## 10. Architecture technique

- **React 19 + Vite + TypeScript**, CSS moderne.
- **Pas de Three.js** : la pièce est en SVG (net à toutes les tailles, léger, accessible au clavier), le couloir en perspective projetée à la main, l'atmosphère en Canvas 2D. Pas de WebGL = pas de fallback à prévoir.
- **Pas de GSAP / Framer Motion** : transitions CSS lentes + quelques `requestAnimationFrame` ciblés, arrêtés quand rien ne bouge ou quand l'onglet est caché.
- Store maison (≈80 lignes) avec `useSyncExternalStore`.
- Scènes en `React.lazy`.
- Le champ `meaning` des indices est **retiré du build** par un plugin Vite (`vite.config.ts`).
- La clé n'est jamais en clair dans le bundle (hachage).

## 11. Arborescence

```
the-empty-room/
├─ index.html              ← contient un commentaire qui compte
├─ public/                 ← favicon(s), robots.txt, un fragment JSON
├─ docs/                   ← CONCEPTION.md, BIBLE.md (spoilers)
└─ src/
   ├─ main.tsx, App.tsx
   ├─ state/        store, types, persistance
   ├─ systems/      session, sceneEngine, clues, attention, presence, clock, roomState
   ├─ scenes/       registry, room/, corridor/, void/
   ├─ components/   Cursor, Atmosphere, Overlay, Settings, Transition
   ├─ puzzles/      key
   ├─ audio/        engine, instruments
   ├─ data/         clues, messages, fragments, layout
   ├─ utils/        random, time, hash, dom
   └─ styles/
```

## 12. Plan de développement

1. **Fondations** — Vite/TS, store persistant, session/visites, moteur de scènes, transitions, atmosphère, curseur. ✔
2. **La pièce** — composition SVG desktop + mobile, lumière, parallaxe, objets, horloge, attention. ✔
3. **Le téléphone et les tasses** — conversation progressive, messages impossibles, appel ignorable, deuxième tasse. ✔
4. **La porte, le couloir** — règle de la porte, perspective, portes numérotées, silhouette, pas derrière soi. ✔
5. **Le vide** — révélation par immobilité, mémoire du vide, saisie clavier, clé. ✔
6. **Les fins** — pièce retournée, pièce vidée. ✔
7. **Son** — moteur procédural, couches réactives. ✔
8. **Accessibilité / perf** — réglages, clavier, mouvement réduit, qualité basse. ✔
9. *Suites possibles* — nouvelles scènes (miroir, cage d'escalier, toit), voix enregistrées, saisons réelles, ARG hors site.
