# Spotter — Moteurs de recherche à explorer

Déjà évalués : DuckDuckGo, Brave, SearXNG, Marginalia

## Généralistes indépendants / souveraineté numérique

- **Qwant** (FR) — s'appuie en partie sur Bing ; développe avec Ecosia l'index européen Staan/EUSP. Devenu moteur par défaut du Parlement européen (juin 2026).
- **Ecosia** (DE) — partenaire de Qwant sur Staan ; revenus pub financent la reforestation.
- **Mojeek** (UK) — seul avec un index propre en dehors de Google/Bing, ~9 milliards de pages indexées, pas de tracking.
- **Swisscows** (CH) — 100% indépendant, axé anonymat total, serveurs en Suisse.
- **Startpage** (NL) — résultats Google via proxy anonymisant, sans tracking.
- **Lilo** (FR) — modèle solidaire, revenus reversés à des associations.
- **Yandex** — index indépendant massif, utile pour diversité de test (sensibilité géopolitique à noter).
- **Stract** — jeune moteur open-source, indexation propre, transparence du ranking (esprit proche de Marginalia).
- **Presearch** — décentralisé, incitatif par blockchain.

## Scientifique / académique

- **OpenAlex** — base ouverte, API libre, 250M+ travaux, remplace Microsoft Academic.
- **Semantic Scholar** (Allen Institute for AI) — ranking contextuel plutôt que mots-clés, TLDR automatiques, citation intent.
- **CORE** — agrégateur open access, full-text libre.
- **BASE** — agrégateur académique, large couverture disciplinaire.
- **Lens.org** — croise papers + brevets, utile si angle propriété intellectuelle.
- **PubMed** — référence biomédicale.

## Réponse synthétisée (au-delà de la liste de liens)

- **Consensus** — synthétise et cite les papers pour répondre directement à une question de recherche.
- **Elicit** — assistant de revue de littérature, extraction structurée.
- **scite** — évaluation de crédibilité des citations (supporting / contrasting / mentioning).

## Technique / code

- **Exa** — "neural search" pensé pour requêtes sémantiques et techniques plutôt que mots-clés.

---

## Premier tri — lecture de cette liste contre les trois exigences

*Ajouté 2026-08-04. Les exigences (spec §5.1) : pas de personnalisation des résultats, pas de pub imposée, **URLs de destination résolvables**. Plus, en préférence forte : un index propre — un méta-moteur au-dessus de moteurs qui personnalisent hérite de leur biais.*

**Ce qui ressort en tête : Mojeek.** C'est le seul de la liste généraliste à cocher les trois exigences *et* la préférence — un des très rares index indépendants hors Google/Bing, pas de tracking, API documentée. Sur les critères que le projet s'est donnés, il est mieux placé que Brave, dont l'avantage est ailleurs (métadonnées riches, `page_age`, `freshness`).

**Un piège qu'il faut nommer, parce qu'il est subtil : Startpage.** Anonymiser *l'utilisateur* n'est pas dépersonnaliser *l'index*. Les résultats restent ceux de Google, avec son classement, son façonnage publicitaire et sa vision du web — le proxy protège qui pose la question, pas la réponse. C'est de la vie privée, pas de la sortie de bulle, et les deux se confondent facilement. **Même remarque, à vérifier, pour Qwant, Swisscows et Lilo** : s'ils s'appuient sur Bing, ils héritent du classement de Bing. Ce qui rend Qwant intéressant n'est pas son présent mais **Staan/EUSP**, l'index européen en construction avec Ecosia — à suivre, pas encore à utiliser.

**Ecosia :** le modèle est financé par la publicité. À vérifier avant tout le reste : est-ce que l'API renvoie des résultats sponsorisés ? Si oui, l'exigence n°2 tombe, quelle que soit la qualité de ce que fait l'entreprise avec l'argent.

**Presearch :** incitation par blockchain. L'écosystème a une position explicite là-dessus — Sovereign GE liste « pas de cryptomonnaie » parmi ses non-capacités assumées. À écarter sur ce motif plutôt que sur la qualité.

**Yandex :** index réellement indépendant, donc vraie valeur de diversité. Mais le calcul d'exposition n'est pas le même : un journal de requêtes dérivé des sujets déclarés d'une personne est un portrait de ce qu'elle veut savoir (spec §5.1), et la juridiction compte pour un portrait.

**Stract :** le plus proche de l'esprit du projet — index propre, ranking transparent, open source. Jeune, donc à mesurer sur la couverture avant d'y compter.

### La couche académique n'est pas une variante, c'est un autre mode

OpenAlex, Semantic Scholar, CORE, BASE, PubMed ne sont pas des moteurs web à évaluer sur la même grille. Ils renvoient des **enregistrements structurés** — auteurs, date, revue, citations — là où un moteur web renvoie un titre et un extrait. Trois conséquences directes :

- **Le triage §5.2 devient beaucoup plus riche et beaucoup moins cher.** Une date fiable, un compte de citations, un lieu de publication : ce sont des signaux de niveau que la Calibration cherche, disponibles *avant* tout fetch et sans appel LLM.
- **Ni pub ni personnalisation, par construction.** Les exigences 1 et 2 sont satisfaites d'office.
- **Le DOI est l'URL la plus résolvable qui existe** — persistante par conception, ce qui est exactement l'exigence n°3, et l'inverse exact des redirections qui expirent.

Pour quelqu'un qui lit des papiers, c'est probablement le meilleur rapport signal/bruit par requête de toute la liste.

### La couche « réponse synthétisée » entre en conflit avec la spec

Consensus et Elicit **produisent** du texte au lieu d'en trouver. §5.4, garde n°1 : *« Retrieve, never rewrite »* — Spotter classe et pointe, il ne devient pas auteur, sous peine d'être exactement le slop qu'il refuse. Leur sortie ne peut donc pas être du contenu proposé au lecteur.

**scite est différent et mérite d'être regardé à part.** Il ne produit pas de contenu : il qualifie des citations en *supporting / contrasting / mentioning*. C'est un **signal**, pas un texte — et le seau *contrasting* est littéralement un détecteur de contradiction argumentée sur un travail donné. Pour la passe éditoriale qui doit proposer des challenges (§5.6.1), c'est le candidat le plus intéressant de la liste entière : il trouve ce qui conteste *un travail précis*, sans jamais avoir besoin de savoir ce que le lecteur, lui, croit.

### Ce que ça suggère comme forme

Pas un moteur, ni même deux, mais **un adaptateur par famille** derrière l'interface existante : un généraliste auto-hébergé, un généraliste cloud, un académique, et éventuellement un spécialisé par sujet quand le sujet le mérite. La question « lequel » devient « lequel par famille », et l'utilisateur en garde le réglage.
