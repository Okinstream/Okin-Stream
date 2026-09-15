# Okin-Stream
Site de streaming foot

## Sources de flux : Football Live Stream API (RapidAPI)

Cette API est intégrée **uniquement comme source de flux**. Les scores, les
compositions et le calendrier continuent de venir de football-data.org,
API-Sports et FlashScore — rien n'a changé de ce côté.

### La contrainte : ~50 appels par jour

Tout le module est construit autour de ce plafond. Le principe :

| Action | Coût en appels |
|---|---|
| Assigner une source à 200 matchs | **0** |
| Un visiteur ouvre l'app, la liste se rafraîchit côté client | **0** (cache serveur) |
| Rafraîchissement réel de `/all-match` | 1, max `FLS_LIST_RESERVE` fois/jour |
| Un utilisateur lance réellement un match | 1, puis **0 pour tous les suivants** |

L'URL posée sur un match n'est pas le flux du fournisseur mais une route
locale : `/api/fls/play/<id>.m3u8`. Le vrai appel `/link/{id}` n'a lieu qu'au
moment où quelqu'un appuie sur lecture, et son résultat est mis en cache
serveur — le 2ᵉ, 10ᵉ et 500ᵉ spectateur du même match ne coûtent rien.

Autres garde-fous :

- **Quota persistant sur disque** (`.fls-cache.json`) : redémarrer le serveur
  ne remet pas le compteur à zéro et ne re-crame pas la journée.
- **Budget scindé** : la réserve `/all-match` ne peut pas être mangée par les
  lectures, et inversement.
- **Coalescence** : 100 clics simultanés sur le même match = 1 appel.
- **Cache négatif** : un match introuvable (404) n'est pas retenté avant 6 h.
- **Coupe-circuit** : une clé refusée (401/403) suspend les appels 1 h, un 429
  les suspend jusqu'à minuit UTC et aligne notre compteur sur celui de RapidAPI.
- **Fenêtre horaire** : aucune sync de liste la nuit.
- **Stale-while-exhausted** : quota épuisé ⇒ on ressert le dernier lien connu
  plutôt que de casser le lecteur.

### Assignation intelligente des sources

Comme pour dlive, l'app devine à quel match de la grille correspond chaque
match FLS (similarité des noms d'équipes sur nom long *et* nom court, gestion
de l'inclusion type « Marseille » ⊂ « Olympique de Marseille », inversion
domicile/extérieur, garde-fou horaire de 6 h, bonus de compétition).

- score ≥ 0,80 → assignation automatique
- 0,50 ≤ score < 0,80 → carte de validation dans l'onglet admin **📡 FLS**
- en dessous → ignoré silencieusement

Un mapping validé par l'admin est stocké dans Firebase (`fls_mapping/`) et
devient définitif. Une source FLS ne remplace jamais une source posée à la
main : elle s'ajoute dans le sélecteur de sources (badge 📡).

### Configuration (`.env`)

```
RAPIDAPI_KEY=...        # clé RapidAPI — sans elle le module reste inerte
FLS_DAILY_QUOTA=50      # plafond dur d'appels par jour
FLS_LIST_RESERVE=       # appels/jour réservés à /all-match (défaut : 12 % du quota)
FLS_LINK_TTL_MIN=120    # durée de vie d'un lien en cache
FLS_WINDOW_START=10     # fenêtre UTC pendant laquelle la liste peut être rafraîchie
FLS_WINDOW_END=23
FLS_MODE=proxy          # proxy | relay
```

`FLS_MODE=proxy` (défaut) fait transiter tout le flux par le serveur : ça
marche partout, mais ça consomme de la bande passante. `FLS_MODE=relay` ne
fait passer que le manifeste par nous et renvoie les segments en 302 vers le
CDN — bande passante quasi nulle.

### Routes

| Route | Rôle | Coût |
|---|---|---|
| `GET /api/fls/matches` | liste en cache + état du quota | 0 (refresh opportuniste) |
| `GET /api/fls/status` | quota seul, pour le panneau admin | 0 |
| `GET /api/fls/link?id=` | résout un flux (préflight du lecteur) | 1 si absent du cache |
| `GET /api/fls/play/<id>.m3u8` | lecture réelle | 0 après le préflight |
| `POST /api/fls/sync` | refresh forcé depuis l'admin | 1 |

La clé RapidAPI ne quitte jamais le serveur.
