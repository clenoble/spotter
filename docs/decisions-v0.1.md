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

## Corrections après la v0.1 (2026-08-19, sur les retours de Céline)

### 11. Les refus sont motivés par un appel forcé — et ma lecture initiale était un contre-sens
Le run de validation a montré le juge local ne statuant que sur ce qu'il choisit
(10/10 `unruled`), et je l'avais consigné comme « connu, mesuré » en citant *« une
consigne dont l'exécution dépend d'une décision ne s'exécute pas »* — **comme si le
diagnostic était une dispense**. Correction de Céline : cette phrase est le constat du
problème, et la solution de l'anti-jeu a été de **mécaniser le déclenchement**. Fait de
même : l'ardoise choisit, puis chaque non-sélectionné reçoit **son propre appel** — une
question sur *ce* candidat ne peut pas rester muette sur lui. `unruled` ne subsiste que
comme trace honnête d'un appel qui a *échoué*, et un invariant l'affirme.

### 12. L'entonnoir entier est visible, motivation grossière → fine
La règle mécanique se nomme elle-même (triage) ; sous la coupe, **l'axe le plus faible
parle** avec sa raison et la marge ; le tri final porte la phrase de l'éditeur. L'étape
Crabe est déclarée absente plutôt que silencieusement manquante.

### 13. Digest historicisé, sources déplacées
L'onglet Digest ne montre que le digest, avec un sélecteur de jour — les jours passés se
reconstruisent depuis le magasin durable ; le détail de run (held back, entonnoir) reste
de classe session et la vue dit quand il n'est plus là. Sujets/flux/exemples : écran
d'onboarding au premier lancement (décidé une fois au chargement, fermé par un geste
explicite — basculer en direct retirerait l'écran sous l'utilisatrice au premier sujet
ajouté), puis rangés sous Préférences. Choix des sujets : champ libre **d'abord** (la
mise en garde d'ancrage de §5.3), liste de départ à cases ensuite, large et visiblement
incomplète.

## Le compagnon — Forme 2 (2026-08-19, arbitrages de Céline)

### 14. Le compagnon produit, tout le monde pull
Arbitrage : Forme 2. Le compagnon (processus Node local, `npm run companion`) fait
tourner le digest la nuit **navigateur fermé** — le vrai palier 1 — et sert :
tableau de bord sur localhost, téléphone sur le LAN. Doctrine du flux : **le contenu
se pull ; ne se pushe que ce que l'utilisatrice a écrit** (sujets, flux, exemples,
réglages), de son tableau de bord vers sa machine. Motif structurel : une extension
MV3 ne peut pas être servie — celui qui détient doit pouvoir servir.

### 15. Les trois coutures Sovereign, tenues d'avance
(1) Le compagnon est un hôte §6.3 — toutes capacités injectées, l'intégration
Sovereign = un 4e binding de capacités, le cœur ne bouge pas. (2) Le modèle de fil =
les types du cœur (`DigestView`, gestes, déclarations) — jamais une forme du
compagnon. (3) Le magasin fichier passe **la même suite de contrat** que mémoire et
IndexedDB ; le binding `sovereign-db` passera la même. Instance Sovereign à lancer à
deux moments seulement : l'implémentation de leur `Assessment`, et le hors-LAN sur
leur relay + app Android.

### 16. Cache de lecture : 3 jours (arbitrage de Céline)
Texte extrait des entrées du digest uniquement — du contenu qu'elle a demandé à lire,
pas un journal. Purgé à chaque run **et** filtré au service. Un item noté sur résumé
reste illisible hors ligne : le résumé et son badge, pas un simulacre de page.

### 17. La frontière HTTP/HTTPS, dite avant d'être payée
Token d'appairage sur **HTTP en clair sur le LAN** : le token gate l'accès (le digest
est un portrait de ce qu'elle veut savoir), il ne chiffre pas le fil. Et la PWA hors
ligne exigera un contexte sécurisé (service worker) — donc un certificat que le
téléphone accepte, coût réel à payer au moment de la PWA, pas découvert dedans.
Rapport de run côté compagnon : mémoire du processus = classe session, même sémantique
que `storage.session`.

### 18. Le lecteur téléphone : cache impatient, pas de service worker sans contexte sécurisé
La question du §17 arrivait à échéance ; elle est tranchée du côté honnête. Un vrai
offline installable exige un service worker, donc HTTPS sur le LAN, donc un certificat
que le téléphone accepte — coût différé, pas caché. La forme retenue : **une page
auto-contenue servie par le compagnon à `/`** (vanilla, une chaîne exportée — aucune
seconde cible de build, l'exe SEA l'embarque telle quelle). Ouverte le matin sur le
LAN, elle précharge les textes du cache de lecture (3 jours) dans le localStorage ;
dans le train elle lit depuis le téléphone, **tant que l'onglet vit** — c'est la
limite, et la page la dit au lieu de la maquiller. Les gestes (open, read) partent en
direct quand le compagnon répond, sinon se mettent en file locale et se livrent au
retour. La page elle-même est servie sans token — chrome statique, aucune donnée
dedans ; chaque appel de données passe par les routes à bearer. Le token se tape une
fois sur le téléphone et reste dans son localStorage : même frontière de confiance que
le profil du navigateur, dite.

### 19. Un jour = son dernier run ; un sujet = une place — mesurés le 2026-08-20
Deux runs sur le même jour UTC (20:51 puis 23:00Z) ont affiché **huit entrées** : la
vue « jour » unionnait les offres du jour. Tranché : le digest d'un jour est **le
dernier run de ce jour, entier** — un acte éditorial fini, jamais l'union. Les runs
antérieurs restent au journal, non affichés. Mécanique : `runAt` sur l'offre (un
timestamp partagé par run ; les offres d'avant migrent par leur `at` identique),
`latestRunOffers` partagé par tous les read-models.

Même nuit, le juge a sélectionné **quatre « pièces » du même ouvrage de Hegel en les
numérotant** — tout en refusant d'autres candidats pour « redundancy with the
selection ». La consigne anti-redondance existait ; rien ne la déclenchait — même
leçon que les refus motivés. Mécanisé : le juge **nomme le sujet** de chaque décision
(champ exigé par le schéma), et le code applique **une place par sujet** — collision
sur sujet normalisé (repli : le titre, qui attrape les sites à une-page-par-chapitre),
le mieux noté garde la place, les autres passent en refusé avec la raison mécanique,
sans consommer d'appel de motivation. La règle n'est pas dans le prompt ; le prompt
annonce seulement qu'elle sera appliquée.

Novelty resserré (barème ancré : le neuf est un fait ou un angle nouveau — une page de
référence sur un sujet ancien n'est pas neuve, si absente soit-elle du frontier), mais
la question de fond est de spec et appartient à Céline : novelty doit-il voir le pool
du jour, ou la redondance intra-run reste-t-elle le devoir du seul éditeur ?

**Résolu le 2026-08-20, définition de Céline, inscrite en spec §2** : novelty = deux
conditions **conjointes** — nouveau à l'échelle du corpus humain (résultat ou idée
récemment publiés ou vulgarisés ; Wikipedia comme référence du « déjà su ») ET non
proposé à ce lecteur dans les runs récents. Le score est la plus faible des deux.
Hegel en soi ne passe plus, sauf découverte qui retourne sa pensée ; un argument
réellement nouveau *sur* Hegel passe. v0.1 opérationnalise « le corpus » par la
connaissance encyclopédique du modèle juge (la direction d'erreur par défaut est la
bonne : trop neuf pour ses poids → non encyclopédique → novel) ; le lookup Wikipedia
vivant reste ouvert — signal unidirectionnel, coût d'egress par candidat, capacité
fetch dans un scorer qui n'en a pas. La redondance intra-run reste au seul éditeur
(une place par sujet). Novelty reste une contribution, pas un gate.

- Mesure mistral vs qwen2.5:7b par axe (le corpus d'éval existe).
- Le lint de la cinquième surface tourne dans la suite ; pas encore en pre-commit.
- Compteur de marges et compteur de plomberie (§5.2) : conception close, non construits.
- Sonde active (degré 1 d'invisibilité) : due, non construite.
- Format d'archive (§6.5) : conception close, non construit — rien d'intime à exporter
  tant que le stance model n'existe pas.

### 20. Le budget de fetch appartient à l'utilisateur — 2026-08-21
Question de Céline devant `over-budget: 99` : *conçu sur quelle base, et réglable ?*
La base : une constante d'instance posée pendant le build autonome — 20 candidats
retenus par funnel (sur 40 considérés), dans l'ordre du classement du moteur, parce
que chaque candidat retenu coûte une page + tous les axes et que l'enveloppe fait
tenir la nuit. Rapportée dans l'entonnoir depuis le début (jamais silencieuse), mais
**non gouvernée** : sur un run réel, 35 % du haul écarté par un chiffre que personne
n'avait choisi. Or c'est une politique, et une politique appartient à l'utilisateur
(principe n°1 du produit). Exposée dans Preferences (« Search depth »), coût nommé à
côté du champ (durée ~linéaire), clampée en core [1, 200] — un NaN tombe sur le
défaut, un zéro sur le plancher : le cadran est à elle, la garde anti-typo à nous.
Poussée au compagnon avec les déclarations à chaque sauvegarde (couture fermée au
passage : les réglages backend ne partaient qu'au réveil du worker ou via le bouton
de Sources). Le second tour de l'éditeur garde son plafond propre (8) : ses requêtes
sont ciblées, pas exploratoires.

### 21. Ce qui se lance se stoppe — 2026-08-27
Constat de Céline : aucun moyen d'interrompre un run depuis l'interface (elle voulait
relancer à budget 40 ; le run en vol tournait à 20). Construit en capacité, pas en
kill : `shouldStop` injecté par l'hôte, sondé aux frontières (entre funnels, entre
candidats) — le run finit le jugement qu'il a en main puis jette `CancelledError`,
rien n'est à moitié écrit, rien n'est persisté. La bannière de run porte le bouton
« Stop this run » ; le compagnon expose `POST /run/cancel` ; l'annulation traverse
`safeFunnel` entière — une décision ne s'enregistre jamais comme substrat mort. Et la
règle mesurée du 19 août passe au compagnon : `lastattempt.json` écrit au départ, le
tier nocturne compare à la dernière **tentative** — un run annulé reste annulé, un
run raté ne se relance pas en boucle. Latence honnête du stop : jusqu'à un candidat
(~1-3 min sur modèle local), dite sur le bouton.
