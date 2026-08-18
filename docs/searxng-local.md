# L'instance SearXNG locale — PANDA2

*Installée et vérifiée le 2026-08-04. Le substrat auto-hébergé de la spec §5.1.*

## Où sont les choses

| Quoi | Où |
|---|---|
| Code | `\wsl$\Ubuntu\home\celin\searxng` (~29 Mo) |
| Environnement Python | `~/searxng-venv` (~350 Mo) |
| Configuration | `~/searxng-conf/settings.yml` |
| Lanceur | `~/searxng-start.sh` |
| Journal | `~/searxng.log` |
| Adresse | `http://localhost:8888` — joignable depuis Windows |

Aucune élévation n'a été nécessaire, ni côté Windows ni dans WSL : toutes les
dépendances Python avaient des roues précompilées, donc rien à compiler et pas
d'`apt install`.

## La tâche planifiée

Nom : **`Spotter - SearXNG local`**, dans le planificateur de tâches Windows.

Deux déclencheurs, deux rôles :

- **à l'ouverture de session** — démarrage propre après un redémarrage ;
- **toutes les 5 minutes** — auto-guérison. Combinée à `MultipleInstances =
  IgnoreNew`, une tentative sur une instance déjà vivante est simplement
  ignorée ; si l'instance est morte, elle repart. Interruption maximale : 5 min.

*Pourquoi la répétition plutôt que « redémarrer en cas d'échec » : mesuré, le
redémarrage-sur-échec ne se déclenche pas quand le processus enfant est tué —
le planificateur ne considère pas ça comme un échec de tâche. La répétition ne
dépend d'aucune sémantique d'échec, elle vérifie simplement.*

*Et pourquoi deux déclencheurs : une répétition accrochée au seul déclencheur
d'ouverture de session ne démarre jamais si la session est déjà ouverte —
`NextRunTime` reste vide. Il faut un déclencheur temporel distinct.*

Vérifié : processus tué, revenu seul en ~162 s sans intervention.

## Commandes utiles

```powershell
Get-ScheduledTask -TaskName "Spotter - SearXNG local" | Get-ScheduledTaskInfo
Start-ScheduledTask -TaskName "Spotter - SearXNG local"     # forcer un démarrage
Stop-ScheduledTask  -TaskName "Spotter - SearXNG local"     # arrêter
wsl -d Ubuntu -- tail -20 /home/celin/searxng.log           # journal
```

Vérifier l'adaptateur contre l'instance :

```bash
npx tsx eval/verify-searxng.ts
```

## Configuration : ce qui a été désactivé, et pourquoi

L'exigence n°1 de §5.1 est *pas de personnalisation des résultats*. Deux moteurs
la violaient dans la configuration par défaut, et **aucun des deux ne s'est vu
en lisant le fichier de config — il a fallu interroger `/config`** :

- **`google cse`** — ma règle disait `- name: google`, qui ne correspond à rien :
  le moteur s'appelle désormais `google cse`.
- **`startpage`** (et ses variantes *news* / *images*) — l'index de Google
  derrière un proxy anonymisant. Anonymiser *l'utilisateur* n'est pas
  dépersonnaliser *l'index* : les résultats restent ceux de Google, avec son
  classement. C'est de la vie privée, pas de la sortie de bulle.

Actifs en catégorie *general* : `duckduckgo`, `mojeek`, `brave`, `wikipedia`,
`wikidata`, plus des utilitaires (dictionnaires, conversion).

## Limites mesurées, à connaître avant de construire dessus

- **Seul DuckDuckGo répond en pratique.** Brave renvoie un 429 à SearXNG, qui
  scrape son interface web et non son API — sans rapport avec notre adaptateur
  Brave. **Mojeek renvoie zéro sans erreur**, ce qui reste à élucider : c'est
  celui qui sort en tête sur nos propres critères.
- **Aucune date.** Les résultats DuckDuckGo via SearXNG arrivent tous avec
  `publishedDate` à `null`. La passe éditoriale (§5.6) raisonne sur *quand* une
  chose est parue ; sans dates elle se réduit à de la détection de redondance.
  C'est la limite la plus structurante, inscrite en §5.1 comme non résolue.
- L'instance tourne tant que la session Windows est ouverte, et maintient WSL
  en vie — coût mémoire non nul.
