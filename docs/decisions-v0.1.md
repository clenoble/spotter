# Décisions prises en autonomie — construction de la v0.1

*2026-08-10 →. Tenues au fil de l'eau pour revue par Céline, comme pour la nuit du 3 août.
Chacune est réversible ; aucune n'a été glissée dans la spec sans être marquée.*

## Cadre reçu (décisions de Céline, 2026-08-10)

- **Publier** = release GitHub à historique écrasé sur `clenoble/spotter`, zips Chrome + Firefox.
- **Sources v0.1** = Mode R (SearXNG + OpenAlex) **et** Mode B (flux déclarés).
- **Entrée maigre** : quand le fetch échoue mais qu'un résumé existe, on note le résumé, **déclaré** (`scoredOn: 'abstract'`).
- **Tous les axes** dans la v0.1.
- **Onboarding** = liste de sujets + liens soumis en bons/mauvais exemples (optionnels).
- F3 agressif (on ne surface que ce qui vaut la peine, le reste trouvable) ; F5 les deux liens, l'utilisateur choisit ; F9 les requêtes de l'éditeur ; F11 local d'abord, cloud différé ; F12 rotation interne, non exposée.

## Décisions d'instance, par ordre de poids

### 1. Challenge sans stance model
La spec fait dépendre l'axe Challenge du stance model, qui n'est pas dans la v0.1.
Interprétation retenue : Challenge juge la contestation **de la ligne dominante de la
moisson et des sujets déclarés** — jamais des positions de la lectrice. Même geste que
la résolution de F9 (on conteste ce qu'un *document* affirme). Conséquence en cascade :
rien d'intime n'est modélisé ni envoyé, la classe `tender` reste vide sur l'hôte
navigateur, pas de chiffrement requis pour la v0.1. Quand le stance model arrivera,
cette forme devient le repli, pas l'axe. *Annoncé à Céline avant de coder ; pas d'objection.*

### 2. Calibration ne tourne pas sans bande déclarée
Sans exemples « good » portant substance (titre ou extrait), le scorer n'est **pas
exécuté** — prédicat exporté `calibrationHasABand`. Inventer une bande depuis les sujets
serait une inférence depuis le contenant. Un axe non lancé est visible (§1.1), et F13
gouverne déjà ce que l'éditeur fait d'un item que ce gate n'a pas vérifié.

### 3. Sujets du second tour de l'éditeur = titres des candidats
Le tour de l'éditeur (contradiction, mouvement) construit ses requêtes depuis le
**titre** du candidat — l'affirmation publique du document. Heuristique v0.1 : un vrai
extracteur de sujet/claim (appel LLM par candidat) coûterait un appel de plus par
candidat pour un gain incertain ; à mesurer avant de payer.

### 4. Persistance par classe dans l'hôte navigateur
Digest surfacé (documents + jugements + offres) → IndexedDB, durable. Rapport de run
(held back, comptes, raisons de l'éditeur) → `chrome.storage.session` : survit à
l'éviction du worker, meurt avec le navigateur ; après redémarrage la vue dit
`heldBackLost` plutôt que de prétendre que la nuit n'a rien écarté. `lastRun`
(horodatage + palier) → `chrome.storage.local` : le palier 2 en a besoin après
redémarrage, et il décrit le système, pas la lectrice.

### 5. `<all_urls>` dans le manifest v0.1
Un produit de retrieval récupère les pages que la recherche rend : la permission large
est inhérente. La version soumise aux stores reprendra le motif de Crabe (permission
optionnelle, demandée à l'usage). Dit ici plutôt que découvert en revue de store.

### 6. Poids de composition par défaut
`relevance 1 · quality 1 · novelty 0.7 · challenge 0.7`, gates multiplicatifs. C'est un
**point de départ documenté** pour une politique que l'utilisateur possède (§4), pas un
réglage optimisé — l'optimiser sur dix items synthétiques serait transformer un test en
cible.

### 7. Un seul digest à la fois
Alarme, palier de fraîcheur et bouton peuvent se déclencher presque ensemble (le
palier 2 se déclenche *exactement* quand le worker se réveille). Un verrou de promesse
partagée ; deux runs concurrents doubleraient chaque appel LLM et écriraient des offres
en double.

### 8. Le juge éditorial sur le palier analyste
`qwen2.5:7b` par défaut pour `judgeSlate` : un appel par digest, la nuit — §5.5 a
dissous la contrainte de latence, le meilleur modèle est gratuit ici. Les axes restent
sur `mistral` par défaut ; la comparaison mesurée mistral/qwen2.5:7b par axe reste un
chantier ouvert (v0.1.x), pas un préalable.

### 9. Le second tour de l'éditeur sur le généraliste seul
Ses requêtes (contradiction, mouvement) sont de forme web, pas académique — et chaque
entonnoir du tour coûte fetches × axes en appels LLM. L'éventail sur tous les substrats
doublait l'étape la plus chère de la nuit pour du matériau où le substrat académique est
le plus faible. Décision de coût, pas un jugement de qualité sur un substrat.

### 10. Exemples : titre + extrait capturés à la soumission
Une URL seule n'apprend rien à un prompt ; re-récupérer à chaque scoring multiplierait
l'egress sans information nouvelle. Un fetch, une fois, au moment du geste.

## Ouvert, connu, non bloquant

- Mesure mistral vs qwen2.5:7b par axe (le corpus d'éval existe).
- Le lint de la cinquième surface tourne dans la suite ; pas encore en pre-commit.
- Compteur de marges et compteur de plomberie (§5.2) : conception close, non construits.
- Sonde active (degré 1 d'invisibilité) : due, non construite.
- Format d'archive (§6.5) : conception close, non construit — rien d'intime à exporter
  tant que le stance model n'existe pas.
