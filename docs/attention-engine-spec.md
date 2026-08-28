# Spotter — attention-scale spec

*v0.9 — 2026-08-10. Canonical source of truth for Spotter. Supersedes the POC framing where they conflict.*

*Changelog: v0.9 — **the v0.1 build.** Céline's rulings of 2026-08-10: **all six axes ship in v0.1**; onboarding is a **topics list plus optional good/bad example links** (they feed Quality as taste exemplars and Calibration as an altitude band); F3 resolved **aggressive** — only what is worth it surfaces, the rest findable but hidden, with the whole held-back set recoverable; F5 resolved **both links, the user chooses**; **F9's hard half resolved** — a Challenge query comes from the editor's own round and contradicts a *document*, never the reader, which dissolves the egress tension rather than trading against it; F11 **local-only for now**, cloud deferred; F12 **rotation is internal**, neither exposed nor settable — routing is not filtering, and a dial would be transparency theatre. Built and wired: the four missing axes (Challenge under a documented no-stance-model interpretation — it contests the day's haul, never the reader's positions, so nothing intimate exists on this host); the editorial judge (`judgeSlate`, protective properties in the assembly, not the model); **scored-on-abstract** per the thin-input ruling, declared to the digest; the **feeds adapter** (Mode B as a `SearchAdapter`, so the funnel has one entrance); the digest orchestrator (persists **only the surfaced**, §6.2); the IndexedDB store held to the **same contract file** as the memory store; and the browser surface — three trigger tiers with the producing tier always shown, per-class persistence with `heldBackLost` said rather than smoothed, and the two explicit gestures. Instance decisions logged in `docs/decisions-v0.1.md` for review. v0.8 — **the day the architecture was settled with the other two nodes, and the last version before code.** Everything here comes from Céline's rulings and a long exchange with the Sovereign and Crabe instances via COORD; §6 grew from a paragraph into the storage and build contract. **Four things this document previously asserted were made false by those rulings and are corrected rather than merely extended** — F8's "openness is never stored" is now **host-dependent** (§3.1, §4); §5.1's "the substrates do not agree on dates, unresolved" is **resolved** by `firstFoundAt` (§5.1); §5.6's two journals are reconciled with signals-carried-on-the-document (§5.6, §6.2); and F10's index entry said "a default of 5" where the body says **at most 5** (§7). Added: the `Assessment` record as a three-node contract, with `degraded` **declared by the judge and never computed by storage** (§6.2); the journals split **by volume** — only what the editor surfaced enters Sovereign's base (§6.2); the meta-mirror as **opt-in, non-retrospective, with its activation date stored and displayed** (§4); the **build architecture** for version divergence — one source, per-host build, no disabled-flag shipping, capability-not-feature, verified on the produced bundle (§6.3); **merge semantics** field by field, with entries recorded **by surface** (§6.4); the **archive export format** (§6.5); a **fourth degree of invisibility** — *beaten* is not *declined*, and the instrument is the **margin**, not the rank (§5.2); and the editor's **narrow capability** plus its own **queries**, which make it a second funnel (§5.6). v0.7 — **the retrieval turn.** Spotter is no longer a feed re-ranker that may one day discover; it is **retrieval and filter, to spot the good and the great**. F2 resolved: discovery is the product, not the horizon. Retrieval runs on existing search engines — **no crawler** — and only on engines that neither personalise results nor force ads (DuckDuckGo-shaped, not Google-shaped). Consequences recorded in §0, §2 (the axis economics invert; Pollution's adversary changes face), §5 (rewritten around retrieval), and §5.3 (the query — new, and undecided). Opened F9–F11, and answered most of them the same day: **F10 resolved** — a finite daily digest, searched overnight, default 5 suggestions, because a digest that ends cannot become a feed (§5.5, and it dissolves the latency constraint that justified the fast/slow model split); **F11 resolved in kind** — two backends, self-hosted *and* cloud, since self-hosted-only would exclude most users (§5.1); **F9 resolved for the base case** — onboarding proposes topics, then articles to rate, yielding query seeds and per-topic calibration in one pass (§5.3), with the Challenge query and its egress tension still open. v0.6 — F1 resolved (stance model: yes). Added §3.1 stance-model privacy design (human-readable, authored-not-inferred, elicit-not-anchor, topic-partition as egress control). F7 resolved (passphrase-derived key; lost = rebuild). F8 resolved (openness not stored — a live challenge cursor in §4, coupled to a strict Crabe gate). v0.5 — resolved F6: per-axis/per-provider backend, protective-by-default with explicit opt-in for cloud judgment of intimate axes (rejected local-only-by-policy as paternalism); eval harness doubles as informed-consent instrument. v0.4 — added §6.1 model backend (user-chosen BYO-key, Crabe's dual-backend pattern) + the privacy/backend collision (cloud mode leaks the stance model) + F6. v0.3 — added §5.1 re-leveling by retrieval (retrieve an on-band published alternative; never summarize) + F5. v0.2 — added the Calibration gate (level-fit per user/topic pair) and split the value model into contribution axes and gate axes.*

## 0. What changed from the POC

The v0.0.1 extension is a **single-platform re-ranker**: it accepts LinkedIn's candidate set and rescores it against a preference document. This spec promotes Spotter to an **attention-allocation engine**: a trusted, user-owned ally whose job is to *safeguard attention against mind-pollution while surfacing what would genuinely be of interest — whether or not the user agrees.*

**v0.7 states the mechanism that goal implies, and it is not re-ranking.** Spotter **retrieves and filters, to spot the good and the great.** It goes looking, and most of what it finds it discards. That is the product.

Three POC principles are revised:

- **#5 "Re-rank, don't retrieve" is retired outright**, not merely as a ceiling. Re-ordering a platform's feed only re-orders the platform's bubble; genuine novelty and disagreement are not in the set to surface, and no amount of rescoring puts them there. Retrieval is the primary mode (§5), not a staged endpoint.
- The single 0–100 score is retired (§2). Attention is multi-axis; one number cannot hold relevance, novelty, disagreement, quality, and pollution at once.
- **The unit of attention is no longer "a post."** It is a *document* on the open web — an essay, a paper, a newsletter issue, an article. The platform-post shape becomes one genre among many, and a minor one.

**Retrieval means search, not crawling.** Spotter issues queries to **existing search engines** and filters what comes back. It does not build or operate a crawler, and it does not maintain an index. The engines it may use are constrained (§5.1): they must not personalise results to the user, and must not force ads into them — the point is to reach outside the bubble, and a personalising engine hands back a bubble of its own making.

Everything else carries: local-first, no raw text stored, zero telemetry, modular adapters, every change a user-approved diff, when-in-doubt-the-user-decides.

## 1. Governing principle — the maïeutic constraint

Spotter wields power over the user's attention. That is acceptable **only to the degree it is inspectable and reversible.** Concretely, non-negotiable:

1. **Nothing is hidden silently.** Anything suppressed or demoted is recoverable and visible on demand ("show me what Spotter held back, and why").
2. **Every surfaced item carries its reason** — which axes lifted it (Plan Visibility, borrowed from Sovereign).
3. **The model of the user is authored *with* the user, not inferred behind their back.** Implicit signals only ever *propose* (changelog, diff-approval); they never silently edit the user model.
4. **The user can always overrule** — per-item, per-axis, per-source.
5. **Transparency is owed to whoever holds the key, not to whoever holds the disk** *(added 2026-08-04)*. Every rule above is a duty toward **the user**. None of them is a duty toward anyone who happens to be in front of her machine — and the two are easy to confuse, because both look like "being open about what we did".

This is what keeps a filtering ally on the *compagnon-miroir* side of the line rather than becoming the *trois visages de l'adversaire* with better manners.

**On the fifth point, because it was not designed — it was found twice in one day, in the same shape.** Both times a transparency requirement written in good faith turned out to disclose something to the wrong audience, and both times the way out was identical: move the disclosure inside what the key opens.

- The mirror must show **under which regime** each slice was recorded (§4.1) — but the challenge cursor it describes is the register of tender points, so that account belongs behind the persona's key, not beside it.
- The archive must **declare the regime that produced it** (§6.5) — but a self-describing file announces itself, so the declaration goes inside the ciphertext rather than in a filename or a header.

The generalisation is worth holding as a test rather than as a slogan: **for every disclosure this system makes, ask who can read it.** If the answer includes someone who does not hold the key, the requirement is aimed at the wrong audience, however honest its intent. *The Sovereign node found the same defect in its own store from this formulation — per-persona files named `*.duress.*`, where the content is encrypted and the partition is not, so the filename carries what the encryption was protecting.*

## 2. The value model — contribution axes and gate axes

A candidate is scored on six axes, never collapsed before composition. They are two structurally different kinds, and the difference governs how they compose (§4).

**Contribution axes** — reasons *to* spend attention. Additive; any one can lift an item.

| Axis | Question | Needs |
|---|---|---|
| **Relevance** | Does this fit declared interests? | preference doc (topics/tone) — *exists* |
| **Novelty** | Is this outside what I already know/have seen? | frontier model (§3) |
| **Challenge** | Does this contest a position I hold, and contest it *well*? | stance model (§3) |
| **Quality** | Is this substantive, well-made, worth the friction? | quality bar (§3) + Crabe reliability as **input, not equal** |

**Novelty, defined** *(Céline's ruling, 2026-08-20 — settling what the first live runs opened)*. Novelty is **two conditions, conjoint**: (1) **new to the human corpus** — a new result or a genuinely new idea, recently published *or recently vulgarised*, at the scale of accumulated human knowledge; and (2) **new to this reader** — not offered in the recent runs (the frontier, §3). Both must hold; either alone scores low. The measured counter-example that forced the ruling: a freshly published introduction to Hegel's *Elements of the Philosophy of Right* is not novel — the page is recent, its substance is two centuries old — unless it reports a discovery that genuinely changes the picture. The subject may be old while the piece is novel: a genuinely new argument *about* Hegel qualifies; a summary, introduction or reference page carries no new idea, however absent from the frontier. And a fresh vulgarisation of a *recent* result counts (that is the re-leveling doctrine's own currency); a fresh vulgarisation of settled knowledge does not.

*Operationalising "the human corpus" (v0.1):* the judging model's own encyclopedic knowledge, by the test *would this substance already sit in a mature encyclopedia article?* — Wikipedia being the reference Céline names. The error directions differ and the default direction is the safe one: a result too new for the model's weights reads as "not encyclopedic" → novel, which is correct; the residual risk is obscure-but-old material reading as new. A **live Wikipedia lookup** is a possible mechanical upgrade — presence of a mature article on the piece's core claim *refutes* world-newness, a one-directional signal like every reliable check — but it is per-candidate egress disclosing subjects to Wikimedia, and a fetch capability inside a scorer that today has none. Open, deliberately.

*Composition consequence:* novelty stays a **contribution**, not a gate — a canonical piece scored 25 still surfaces if relevance and quality earn it. The ruling changes what novelty *measures*, not what it may veto. Intra-run redundancy remains the editor's duty, enforced mechanically (one slot per subject, §5.6).

**Gate axes** — reasons *not to*, or *at what cost*. Multiplicative; they only demote, never lift on their own.

| Axis | Question | Needs |
|---|---|---|
| **Pollution** | Is this engineered extraction — outrage-bait, hollow virality, slop? | pollution detector (§3). One-sided: high pollution suppresses. |
| **Calibration** | Is this pitched in *my* zone for *this* topic — neither over my head nor lay-level in my own field? | expertise map (§3). Two-sided: too-hard *and* too-easy both demote. |

**Why two kinds.** A perfectly clean, perfectly calibrated post about nothing I care about should not surface — low pollution and good level-fit are not, by themselves, reasons to spend attention. They are conditions on *how* an already-worthwhile item reaches me, not reasons it is worthwhile. Folding them in additively would let an item float up for being merely inoffensive. So gates multiply the contribution score; they cannot manufacture one.

**Why pollution is a gate, not a filter on relevance.** The adversary engineers content to score *high* on relevance — that's what engagement-optimization is. Rewarding relevance alone rewards the best-engineered bait. The pollution gate penalizes engineered-ness directly, independent of topic fit. This is the "safeguard attention" half made computational.

### 2.1 What retrieval does to the axis economics (v0.7)

Under re-ranking, the platform formed the candidate set and the engine's job was defensive: take what you are given, push the worst down. The gates did the visible work.

Under retrieval the load moves to the **contribution** axes. Spotter forms the candidate set itself, and the task is *finding the good and the great* in a large, mostly-worthless haul. Quality and Relevance decide what surfaces at all; the gates go back to being what §2 says they are — conditions on *how* an already-worthwhile item reaches you, not the reason it is worthwhile. **Quality stops being the axis we hadn't got to yet and becomes the one the product turns on.**

**Pollution does not shrink — it changes face.** The feed adversary was broetry, comment-to-DM funnels, manufactured outrage: content engineered for *engagement*. The search adversary is content engineered for *ranking* — SEO chum, listicle farms, and machine-generated filler dressed as an article. It is the same principle (judge the construction, not the topic) aimed at a different craft, and it is arguably harder: engagement bait announces itself with a hook, whereas SEO chum is built to look exactly like the substantive article it is imitating.

This is measurable and has been measured, and it was the one place the local models fell down: on a synthetic corpus, generic machine-written filler was the single item every local model scored as *clean* while a cloud model caught it. Retrieval makes that failure central rather than marginal.

**The prompt has been rewritten for both adversaries** *(2026-08-03)*: it now names ranking-engineered filler alongside engagement bait, gives a test that separates them (*strip the formatting and the confident tone — is a claim, fact, experience or number left?*), and requires the stated reason to quote something specific rather than restate a category. That last clause came from reading outputs: models were handing the old prompt's own vocabulary back as their verdict, which is a judgment nobody can check.

On the existing corpus every local model moved a long way — MAE roughly halved, bucket agreement up 20 to 30 points — and, importantly, the gain is spread across all four pollution items rather than concentrated on the one known failure. **Two honest limits on that.** The corpus is ten synthetic items written by an instance, and its earlier failures were known before the rewrite, so this is *consistent with* a better prompt and is not evidence of one; the measurement that would count is a real, genre-spanning corpus (§3.2). And the rewrite introduced an **overshoot on the middle band** — an item with real content wrapped in an engagement hook went from far too clean to far too polluted. For a *gate* that direction is the dangerous one, since it demotes genuine material.

**The middle band is now the axis's known weakness, failing in both directions**, and it is deliberately left unfixed: iterating a prompt against a ten-item corpus until the numbers look right is how a test becomes a target.

**Calibration stops being optional too.** A feed is roughly level-homogeneous; a search result set is not — the same query returns a tweet, a vulgarisation piece, and the underlying paper. The band (§2, §5.4) is what makes that haul usable.

**Why calibration is its own gate.** Novelty is not monotonic with value. New-but-over-my-head is noise I can't use; new-but-lay-level in my own field is cognitive load with no payoff — I can mine the valuable part, but mining *costs attention*, the very thing we are protecting. The right level is a *band* per (user, topic) pair — the zone of proximal development / the flow channel, applied to information triage. Calibration scores fit to that band. It is two-sided, and it cross-cuts: a *challenge* or a *novel* item pitched wrong is as unusable as a relevant one, which is why it gates all the contribution axes rather than living inside novelty.

**Quality ≠ reliability.** Crabe answers *is this epistemically sound*. Quality here also asks *is this deep / original / well-reasoned*. A reliable post can be hollow; a flawed post can be the challenge worth seeing. Crabe joins by id through the side channel (unchanged from the POC plan) and feeds Quality; it does not define it.

**The Crabe contract, as of 2026-08-03** *(from the Crabe instance via COORD)*. Crabe no longer emits a score — it emits an **axis vector**: four axes (`content`, `provenance`, `lateral`, `citations`), each marked contribution or gate, with the same composition semantics as ours. That symmetry is deliberate on their side, borrowed from this model so the contract needs no translation layer. Three properties we should consume rather than flatten:

- **`not_run` is not zero.** An axis that could not run reports `not_run` with its reason. *"We couldn't look"* and *"we looked and it was bad"* stay distinct all the way to the screen — the same discipline as our own `ok: false`.
- **Every claim carries an evidence level**: `verified` > `retrieved` > `assessed` > `recalled` > `absent`. So Crabe now says what its verdict *rests on*. A `recalled` reliability judgment should not gate as hard as a `verified` one, and the challenge cursor (§4) is where that distinction bites. Open: does the cursor read the evidence level, or only the score?

⚠️ **Verified against the shipped artefact, 2026-08-10 — and one thing this document said was wrong.** The four properties above were encoded from Crabe's description via COORD and never checked against their code; reading `docs/ARCHITECTURE-v3.md` at tag `submitted-3.0.0` confirms all four. But it also gives the **assignment**, which this document had left blank and then reasoned over anyway:

| Crabe axis | kind | characteristic tier |
|---|---|---|
| `content` | contribution | `assessed` |
| `provenance` | contribution | `recalled` |
| `lateral` | contribution | `retrieved` |
| `citations` | **gate** | `verified` |

*The tier column is **characteristic, not structural**: in the data a tier sits on each **`Finding`**, not on the axis, so an axis mixes tiers and the table above is what its findings typically are. Aggregating them is not ours to invent either — their `TierInfo.restsOn` already states the rule, that a summary **inherits the weakest support beneath it**. We use theirs.*

**So "the Crabe gate" — a phrase this document used in §4 and §5.4 — is not a thing that exists on their side.** Their only gate is `citations`, which is about links that resolve and say what the page claims. The *reliability* judgment lives in `content` and `provenance`, which are **contributions**. Tightening "the Crabe gate" against reliable-*sounding* contrarian material would tighten a broken-link check, which is not what those passages meant.

The correction is small and it is ours: **Spotter composes a reliability gate from Crabe's contributions; Crabe does not ship one.** They have deferred a composite deliberately (Phase 4, to be co-designed) and may never ship one at all. So the cursor coupling of §4 and the down-level guard of §5.4 gate on *our* composition of their vector, which we own and must state — rather than on a gate of theirs we would have been naming without having read. *This is the `unresolvable` failure at a different scale: a word read in place of the thing, in a contract built on for a week.*

⚠️ **And an asymmetry that lands on the protective default.** `lateral` — their only `retrieved` axis, the one with real citations — is **unavailable in Ollama mode**, because the provider has no search tool; it reports `not_run` with the reason rather than falling back to a cloud provider. So a user on the local path gets Crabe's *weakest* evidence: `assessed` and `recalled` only, with `provenance` permanently `recalled`. This is the same shape as the `publishedAt` finding in §5.1 — **a dependency that fails hardest on the safe option** — and it bites §5.4's third guard, which requires a down-level to clear Crabe. On the local path, what exactly is it clearing? Open, and it belongs to both nodes.

⚠️ **A limit Crabe states rather than engineers, which we inherit whole.** Their §7: *the tiers describe how strong a claim's evidence is; they say nothing about whether the model reasoned well from it.* A judgement about text the reader can also see is `assessed` whether it is acute or absurd — held perfectly on 2026-08-09 while a local model classified a satirical article as Factual, and another called a first-person essay Fiction citing evidence it appears to have supplied itself. **No test catches this**, and a Spotter gate that trusts the vector inherits it exactly. Worth stating here because a contract that holds while the answer is wrong is the one failure a consumer cannot detect downstream.
- **Crabe is text-only.** The media axis was specified, researched, and abandoned on evidence (C2PA is on under 1% of press images and does not survive social CDNs; the only image-search API returning dates is paid and single-sourced). A `SCOPE_NOTICE` travels inside the vector rather than in Crabe's UI, precisely so a downstream consumer inherits the limit with the data. **Any assumption that Crabe can speak to an image is void** — which matters more under retrieval than it did under re-ranking, because search returns image-led pages.

⚠️ **Retrieval makes Crabe more load-bearing, not less.** Re-ranking a feed meant judging sources the user had already chosen to follow. Search returns arbitrary pages of unknown provenance — exactly the case Crabe exists for.

## 3. User-model artifacts

The POC's preference doc is insufficient — it models *topics*, and the ambitious goal needs models of *positions*, *frontier*, *quality bar*, and *expertise level*.

- **Preference doc** *(exists, extend)* — interests, tone, author boosts/mutes. Feeds Relevance.
- **Stance model** *(new)* — positions the user holds, so Challenge can find well-made contradictions. **This is the privacy-heaviest artifact in the system** — a local model of the user's beliefs. User-authored, diff-approved, never silently inferred, encrypted at rest, never leaves the device by default. Full privacy design in §3.1.
- **Frontier / known-set** *(derived)* — what the user has already encountered, from the consumption log. Feeds Novelty (distance from the known).
- **Quality bar** *(new)* — exemplars + rubric of what *this* user finds substantive vs. hollow. Seeded by onboarding ("the quality of what they like"), rubric-shaped after Crabe's per-category criteria but aimed at craft/substance, not reliability.
- **Expertise map** *(new)* — per-topic competence (expert / competent / novice), so Calibration knows where the band sits for each topic, and so Novelty and Challenge can pitch to the right level (novel *at my level*, challenge *at my level*). Partly derivable from the consumption log and stance model; seeded and correctable in onboarding. Less intimate than the stance model — *what you know*, not *what you believe* — but still local-only and diff-approved.

### 3.1 The stance model — privacy design

The privacy-heaviest artifact. Most of its safety is decided by representation and authorship, *before* encryption.

1. **A human-readable document, never an inferred model.** Positions are plain statements in the user's own words ("I think distributed governance scales better than people assume"). Same lifecycle as the preference doc — onboarding seeds, chat edits via diff-approval — for a heavier payload. This is the privacy choice and the functional one: an LLM judge reasons better against readable positions, and the user can read, edit, and delete exactly what is stored. **No embedding store for stance** — a vector is opaque (uninspectable, partially invertible, un-editable), which breaks the one invariant that makes the artifact tolerable.

2. **Authored, never inferred.** The model holds only positions the user put there. Behavior may *propose* one ("you keep arguing X — is that a position you hold?") through the changelog; nothing persists without explicit confirmation. Privacy and accuracy at once — engagement is not belief.

3. **Onboarding elicits, never anchors.** Open questions, the user's own articulation, reflect-back-and-confirm before storing. Never a checklist of pre-written beliefs to uncheck — that manufactures positions and anchors the user to the system's framing. The *compagnon-miroir* reflects what is there; it does not hand the user a self.

4. **Topic-partition is an egress control, not a matching limit.** Locally, Challenge reads the *whole* stance model — full cross-domain power (an economics position contested by a biology finding, the highest-value kind of challenge), at zero privacy cost since it stays at the edge. On any cloud opt-in (§6.1), only the *topic-relevant slice* egresses — least-privilege on the wire.

**Encryption / keys (F7 resolved).** Encrypted at rest with a **passphrase-derived key.** If the passphrase is lost the stance model is unrecoverable and must be re-authored — an acceptable, non-dramatic loss: the stance is rebuildable, not irreplaceable. This keeps the protective property that nothing on disk can decrypt the beliefs without the user. Sovereign's key hierarchy + guardian recovery supersede this when Spotter moves in.

**Openness is never a field on the stance model — and whether it is stored at all is now a rule per host (F8, revised 2026-08-04).** The model holds *what* the user believes, flat. *How open* they are to revising a given position is never recorded **as a property of a position**, in any host: that would be a ledger of vulnerabilities sitting inside the belief model, which is the one shape this artifact must not take. Openness lives as a live cursor in §4.

What changed is whether that cursor **persists**:

- **In the browser extension, it does not.** There is nothing to guard or leak — privacy by not-collecting, as originally specified.
- **In Sovereign, it does** *(Céline's ruling)*. In a local store with per-field encryption and no telemetry, keeping it is judged safe, and it buys a markedly more precise mirror.

**So the protection changes nature rather than disappearing, and that must be said plainly.** The extension is protected by *absence*; Sovereign is protected by *field-level encryption over per-persona key stores* (CRYPTO-001). The second is a real protection and it covers the case F8 feared — cursor plus challenge values **are** the register of tender points, and a duress session must not expose them. That holds automatically as long as the cursor is stored as an ordinary encrypted entity; it would break if someone later reached for a performance shortcut around it. Written here for that reason.

Two consequences elsewhere: the mirror's precision becomes host-dependent, so **the mirror must show under which regime each slice was recorded** (§4), and the neutral-reference scheme once proposed for cross-host comparability is withdrawn — a stored cursor travels *with* the challenge score that it produced, so comparability comes from the fingerprint rather than from neutralisation (§6.2).

### 3.2 The calibration corpus *(new in v0.7)*

The artifacts above are only as good as the examples that seed them, and the retrieval turn changes what a good example is.

**It must span web genres, not post shapes.** *(Contributed by the laptop instance, 2026-08-03, in the conversation where the retrieval turn was first raised.)* Essays, papers, newsletter issues, SEO chum, listicle farms — not just LinkedIn-shaped posts. A corpus of feed posts calibrates an axis for a surface the product is leaving.

**One label per axis, never one gradient.** Observed while reading the first real URLs Céline curated: the sheets were *Excellent / OK / Garbage*, and on inspection Excellent and OK were **quality** judgments while Garbage was a **relevance** judgment — a different axis, not the bottom of the same scale. Collapsing them would teach Quality that off-topic is a defect of craft, which is false and corrupts both axes. Two consequences for anyone building this corpus:

- Label each item on each axis it speaks to, independently. A document can be excellent and irrelevant.
- The discriminating quadrants are the ones that separate the axes: **hollow but on-topic** (the empty article about something you care about — the case SEO chum is engineered to occupy) and **excellent but off-topic**. A corpus of clear cases measures the ease of the cases, not the judgment.

**Its first job is not scoring, it is choosing a backend.** §6.1 promises the trade between local and cloud judgment will be shown, not asserted. That promise is only as honest as the corpus behind it.

## 4. Composition — the user's policy

Axes are combined by a **policy the user owns**, not a fixed formula:

- **Contribution axes are weighted and summed; gate axes then multiply the result** (pollution and calibration scale it down, never up). A score is `(Σ weighted contributions) × pollutionGate × calibrationGate`.
- **Weights** per contribution axis (how much challenge vs. comfort).
- **Dispositions** — named presets the user can switch ("challenge me / stretch", "I need calm", "discovery"), each a weight profile **plus a calibration band**. "Stretch" shifts the band toward the harder edge (tolerates over-my-head, penalizes too-easy harder); "calm" narrows it toward the comfortable centre. Same flow-channel, moved by intent.
- **Challenge cursor — openness as a live control; persisted or not depending on the host (F8, revised).** A cursor the user pushes up or down — *how contrarian a diet do I want right now* — parallel to the calibration band, **never a field on the stance model** (§3.1), in any host. It is not persisted in the extension; it is persisted in Sovereign, as an ordinary field-encrypted entity under per-persona keys (§3.1). The dashboard reflects the user's current contrarian posture back to them (*méta-miroir*; transparency is the UI). **Coupling: the higher the challenge cursor, the stricter our reliability gate over Crabe's vector.** Seeking disagreement is exactly when one is most exposed to reliable-*sounding* contrarian garbage — so at high settings, reliability is required at its strictest: high reliability *within its class* (a rigorous argument or a well-evidenced claim), **not factual-only** — a strong challenge is often well-made opinion, and forcing factual-only would starve the axis. The more you open to being challenged, the higher the bar on what is allowed to challenge you.

  ⚠️ *Corrected 2026-08-10, after reading their shipped code: this said "the Crabe gate", and Crabe has no such gate.* Their only gate is `citations` — links that resolve and say what the page claims. Reliability lives in `content` and `provenance`, which are contributions, and they have deliberately not shipped a composite. **The gate is ours, composed from their vector**, which also means the evidence tier is ours to weigh: `provenance` is permanently `recalled`, their weakest tier, so a publisher-reputation signal must never gate as hard as a `verified` one (§2).
- **Hard floors** — e.g. never surface above pollution X; never suppress below quality Y without showing it.
- **Exploration budget becomes principled**: the share reserved for Novelty+Challenge, *not* random off-topic noise. (The POC's `explorationRate` exists in schema but is currently unwired — §spotter-state.)

Default disposition is an open decision (§7, F3).

### 4.1 The meta-mirror — opt-in, and it starts when you turn it on *(decided 2026-08-04)*

The dashboard that reflects the reader back to herself is the *méta-miroir*, and it is the one surface that keeps judgments over time. Three rules, Céline's:

- **Opt-in.** Judgments are retained **only if the mirror is switched on.**
- **It begins at that moment — no reconstruction of the past.** The alternative (collect silently, reveal on activation) is collection without consent, whatever the interface says afterwards.
- **Its activation date is stored and displayed by the mirror itself.** Without it, the mirror computes *"you read 40% of what contradicted you"* over a window that silently begins mid-story — a percentage without its denominator, which is precisely the defect Crabe's evidence levels exist to prevent.

**The cost is accepted rather than discovered**: the mirror can never answer a question about the past, and *"have I drifted this year?"* is exactly the moment one would want to switch it on.

**And it displays under which regime each slice was recorded** (§3.1): mirror precision is host-dependent now that the challenge cursor persists in one host and not the other. A mirror that compared heterogeneous slices as if they were homogeneous would be doing the thing this document refuses everywhere else.

*This double nature was already in the anti-jeu graph — MECH-0021, "opt-in for the player, always active for the companion." The two halves map exactly onto the split here: vectors kept on the player's side on activation, the 30-day reject window (§5.2) always active on the companion's. Nobody derived this design from the fragment; it was already there.*

## 5. Sources — retrieval first (`SourceAdapter`)

The POC's `FeedAdapter` generalizes to a `SourceAdapter`. A source has a *mode*; the value engine is identical across modes. v0.7 reorders them: **Retrieve is the product**, the other two are secondary surfaces that happen to share the engine.

- **Mode R — Retrieve** *(active, primary)*: Spotter issues queries to existing search engines (§5.1), fetches what looks promising, and filters hard. This is "scan for value itself", and it is what the product is for. It reaches things in no declared source and outside any platform's bubble.
- **Mode B — Ingest** *(pull, and better than "secondary" suggested)*: fetch a handful of sources the user declares and trusts — followed sites, newsletters, what RSS used to do. Cheap, exact, and **for a given reader often the best signal-to-noise in the whole system**: Céline names *Le Grand Continent* and *MIT Technology Review* as hers, where not everything is worth reading but the hit rate beats anything search returns. The earlier framing — *a declared source is a bubble you chose* — is true and is not the whole truth: a curated bubble with a high hit rate is a real asset, and the editorial pass (§5.6) still filters it rather than waving it through. Mode B is where the reader's own judgment enters the system as a first-class input; Mode R is what reaches past it. **Neither substitutes for the other**, and a design that treats Ingest as a lesser Retrieve gets the economics backwards. *(RSS was retired in v0.6 as the primary channel. As a mechanism for declared sources it is cheap, exact and still widely served — worth reinstating in that narrower role.)*
- **Mode A — Re-rank** *(passive, legacy)*: observe a platform feed in place, rescore, reorder. This is the POC and it still runs. It is kept because the code exists and the surface is real, **not** because it is where the value is — re-ordering a bubble leaves you in the bubble (§0).

**No crawler, in any mode.** Spotter does not spider the web and does not maintain an index. It asks engines that already have one. This is a standing constraint, not a staging decision: it bounds the engineering, keeps the bot-detection and politeness burden off the user's machine, and keeps the project honest about what it is — an attention filter, not a search company.

**What Sovereign changes, and what it does not.** Under Sovereign, retrieval gains background execution, cross-device state, and shared discovery between the user's own surfaces. It does **not** gain a crawler. The browser body's real limits are CORS, per-engine terms, and the cost of one LLM call per candidate — the first two ease under Sovereign, the third does not.

### 5.1 The search substrate — which engines qualify

Two hard requirements, both following from the point of the product:

1. **No personalisation of results.** An engine that tailors results to an inferred profile hands back a bubble of its own construction, which is the thing Spotter exists to escape. This rules out the major personalising engines — Google by name.
2. **No forced advertising in the result set.** Ads are attention extraction at the retrieval layer; filtering them downstream is treating a wound the source inflicts.

Beyond those, prefer engines with an **independent index** (a meta-search over personalising engines inherits their bias), a usable **API rather than HTML scraping** (scraping is brittle, adversarial to the operator, and usually against terms), and terms that permit this use.

⚠️ **The substrates do not agree on dates, and §5.6 runs on dates** *(measured 2026-08-04, on a real local instance)*. The academic source gives `publication_date`; the Brave API gives `page_age`. **The self-hosted path gives nothing** — SearXNG's DuckDuckGo results carried no `publishedDate` at all on every result of a live query. Since the editorial pass reasons about *when* something appeared ("this subject has been absent two months"; "this repeats Tuesday's"), a substrate without dates would degrade it to redundancy-checking only.

**Resolved: the editorial pass runs on `firstFoundAt`, not on the publication date** *(Céline, 2026-08-04)*. What §5.6 actually needs is *when this crossed our desk* — our own timeline, always available, always ours — and not *when the document was published*, which is the provider's and is missing on a whole substrate. The publication date is kept where a provider supplies one, because "published in 2019, found today" is a real distinction the editor may want, but **nothing depends on it**.

*Worth keeping as a pattern rather than a fix: a design resting on `publishedAt` would have been weakest exactly on the self-hosted path — that is, on the protective default. A dependency that fails hardest on the safe option is a design smell, not bad luck.*

**A third hard requirement, learned rather than reasoned** *(v0.7, from the Crabe instance via COORD)*: **the engine must return resolvable destination URLs.** An LLM's own grounding citations are not automatically that — Gemini's are opaque, ~30-day redirects that its terms forbid resolving (detail in §5.4 guard 4). A substrate that cannot tell us where a result actually points cannot feed a product whose first promise is that every surfaced item carries its reason.

**Decided: two backends, not one (F11).** Spotter ships **a self-hosted option and a cloud option**, for the same reason §6.1 ships local and cloud model backends — *self-hosted only would be a non-starter for many*, and a sovereignty guarantee nobody can meet is a guarantee for nobody. The substrate is a dial the user sets. The two hard requirements above, plus resolvable URLs, bind **both**: cloud does not mean laxer, it means a different trade.

**And that trade differs in shape from the model-backend one, which the settings surface should say plainly.** With self-hosted meta-search the queries still reach the underlying engines, but attached to no account and no key. With a cloud search API they reach one company, tied to the user's key, and are therefore linkable over time. Under §5.3 the query set is derived from the user's own declared topics — so the query log *is* a portrait of what that person wants to know, which is a heavier disclosure than handing over a document to be scored.

**Plurality is itself the answer to that** *(2026-08-04)*. Several backends were adopted for coverage and for inclusion — one adapter per family, self-hosted *and* cloud so that nobody is excluded. They turn out to do a third job, and it is the one that answers the objection just above: **spread across providers, no single one of them holds enough to reconstitute the portrait.** What each sees is a fragment. This makes the multi-adapter design a privacy mechanism rather than only a coverage and fairness one, and it means the count of backends is not merely a convenience to be collapsed later for simplicity's sake.

Two things follow, and neither is settled here.

**How queries are routed decides whether fragmentation is real.** Round-robin splitting gives every provider a representative sample — a smaller portrait, but the same portrait. Routing by *topic* gives each a coherent slice instead, which fragments the whole but hands one provider a complete view of one subject. Which is worse depends on what is feared: *someone knows everything about me vaguely* or *someone knows one thing about me precisely*. For an intimate subject the second is worse, so the two are not interchangeable and a default has to be chosen deliberately.

**The self-hosted backend is the obvious floor.** Queries there reach the underlying engines with no account and no key attached, so routing the sensitive topics to it — and splitting only the rest — is strictly better than any distribution across cloud providers. That is §6.1's structure again: the intimate case defaults to the local path, and the user may move their own line.

**Rotate subjects across the generalists** *(2026-08-04)*. This is the third option, and it beats both. A fixed topical map hands one provider a standing view of one subject; round-robin hands everyone the same picture at lower resolution. **Rotating which generalist serves which subject over time** gives each provider a *discontinuous* view — a slice of one subject for a while, then nothing, then a different subject — which is markedly harder to accumulate into a stable profile than either alternative.

It applies **within the generalist family only**. Families are not interchangeable: an academic source is better for papers than any generalist, so rotating across families would trade real quality for a privacy gain that fragmenting the generalists already delivers.

⚠️ **What fragmentation does not buy — and where the line of responsibility falls.** It protects against each provider individually, in good faith. It does not survive providers pooling data, nor an observer of all outbound traffic at once; and **the IP address is a join key** that no amount of query-splitting removes.

But that last one **is a property of the user's whole internet connection, not of Spotter**. Every site they visit sees the same address, and a tool that filters attention is not the right place to solve network-layer anonymity — attempting it would be scope the project cannot honour, and pretending it were solved would be worse. So Spotter states the boundary plainly and leaves the decision where it belongs: whether to sit behind a VPN or Tor is the user's, made once for everything they do, not a Spotter setting. *(This is also consistent with the ecosystem's posture — Sovereign GE lists Tor integration among its deliberate non-capabilities.)*

The guarantee to put in front of the user is therefore the true, narrow one: *no single provider can build your profile from what Spotter sends it* — a claim about Spotter's own behaviour, which Spotter can actually keep.

⚠️ **Which two, still open.** DuckDuckGo is the shape of what is wanted, but *whether it exposes a usable web-results API is unverified* — its public API answers instant-answer queries, not general web results, and the HTML endpoint is scraping. Two API traps already measured next door, worth knowing before the evaluation rather than during it: Anthropic's `web_search_20260209` routes through the code-execution tool by default, so a direct call without `allowed_callers: ['direct']` returns a 400; and on Gemini, grounding and structured output are **mutually exclusive** on `generateContent` (400 `INVALID_ARGUMENT`) — only the newer `/v1beta/interactions` endpoint with a Gemini 3.x model combines them, in preview. Candidates to evaluate, in order of fit with the rest of the project: **SearXNG** self-hosted (meta-search, no personalisation, no ads, and the natural fit once Sovereign exists — at the cost of the user running something), **Brave Search API** (independent index, documented API, paid), **Marginalia** (independent non-commercial index, small, biased toward long-form text — which is the bias this project wants). **Widen the field before choosing** *(2026-08-04)*. The candidate list is in `docs/spotter-moteurs-a-explorer.md`, with a first pass against these requirements. Three findings worth carrying here:

- **Mojeek** is the strongest generalist on the project's own criteria — one of the very few independent indexes outside Google and Bing, no tracking, documented API. Brave's advantage lies elsewhere (richer triage metadata).
- **Anonymising the user is not de-personalising the index.** A proxy in front of Google returns Google's ranking, shaped by Google's incentives; it protects who asked, not what comes back. Privacy and bubble-exit are different properties and are easily confused.
- **Academic sources are a different mode, not a variant.** OpenAlex, Semantic Scholar, CORE, BASE and PubMed return *structured records* — date, venue, authors, retraction status — which makes §5.2's triage far richer and cheaper, satisfy requirements 1 and 2 by construction, and resolve through DOIs, the most durable URLs there are. Retraction in particular is a fact the provider states, so it is a triage *rule* rather than a judgment: withdrawn evidence is dropped, not demoted.

  ⚠️ **Two corrections to that, from measuring rather than assuming** *(2026-08-04)*. **Citation count is not usable here.** It accrues over years, so anything recent reads as zero whatever its quality, and using it as a proxy for worth would systematically bury the new — the opposite of the job. OpenAlex's age-normalised variants do not rescue it: on papers from the last three months they come back null, zero, or contradictory. **And the recent slice of an academic index is noisier than its reputation suggests** — probing it returns a great deal of self-published and preprint material, with Zenodo and Kaggle appearing as venues. So the claim that academic sources give the best signal-to-noise per query holds for *established* work and weakens for the recency window this product is built around. `venue` and `type` are what discriminate there.

So the shape is **one adapter per family** rather than one winner: a self-hosted generalist, a cloud generalist, an academic source, and topic-specialised engines where a topic earns one. The user keeps the dial, as with model backends (§6.1).

### 5.1.1 What the first real run of the funnel measured *(2026-08-10)*

The adapters had each been verified alone; **the funnel had never run**. It has now, twice — once on the self-hosted generalist, once on the academic source — and it found three things no unit test could have.

**1. The bottleneck is acquisition, not judgment.** Ten searched → ten past triage → **two fetched**. On the academic substrate, twenty → twenty → **three**. So **80–85% of candidates never reach an axis at all**, and every hour spent on scoring is spent on the fifth of the haul that survived. *This reorders the work: the axes are not what is limiting the product today.*

**2. And the loss is concentrated exactly where §5.1 says the good material is.** The unreadable were `springer`, `jstor`, `academic.oup`, a university repository, a PDF — and on the academic run, seventeen consecutive `doi.org` links. This corrects a claim made two paragraphs above: DOIs were praised as *"the most durable URLs there are"*, which is true and was **the wrong property to praise**. A DOI is durable for *citing*; it resolves to a publisher landing page that is frequently paywalled, bot-walled, or a PDF this extractor cannot read. **Durability and readability are different, and the spec had treated the first as evidence of the second.**

⚠️ **3. The finding that only a live run could produce: thin input makes Relevance confident, and nothing catches it.** On the academic run, *"Historical institutionalism in comparative politics"* scored **relevance 90** against the query *attention economy critique*; *"On the Idea of the Moral Economy"* scored 85. Both are off-topic. What the axis actually read was a landing page — abstract plus journal furniture — and on that it produced a high score with a plausible reason (*"discusses a topic related to 'attention' through…"*). **Pollution passed all three at 1.0**, correctly: the pages are not engineered, they are simply not the article.

So an *extraction* weakness feeds a *scoring* weakness and the composite comes out **confident**. This is §2.1's SEO-chum problem arriving from an unexpected direction — the thing imitating a substantive article is a legitimate journal's own landing page. Neither gate is built to see it, because it is not adversarial.

*Not fixed here, deliberately. Tuning the Relevance prompt against three observed items is how a test becomes a target (§2.1), and the defect is upstream of the prompt anyway.* Two directions, both decisions rather than patches: **use the provider's structured record when the fetch fails** — OpenAlex returns abstracts, already reconstructed by our adapter, so an academic candidate need not be dropped for being unfetchable — at the cost of scoring an abstract as though it were the article, which must be **declared and not silent**; or **require a minimum extracted length proportional to what the axis is being asked to judge**, which drops more and admits it.

*Recorded rather than resolved, because both change what a score means.*

#### Do the walled sources have feeds? Measured, and the answer splits three ways

*Céline's question, and the right one to ask of a fetch wall. Probed 2026-08-10 rather than reasoned.*

| Source | Feed | |
|---|---|---|
| Springer | 200, **zero items** | |
| OUP Academic | connection closed | **access is the product** |
| JSTOR | none declared | |
| UNC repository | **10 items, with text** | |
| arXiv `cs.CY` | **30 items, with text** | **open repositories and preprints** |
| Le Grand Continent | 10 items, with text | |
| MIT Technology Review | 10 items, with text | **editorial publications** |

**The dividing line is not academic-versus-not: it is whether the source's business is access.** Commercial publishers have no usable feed *and* wall the fetcher, and those are one refusal rather than two. Everything else has both.

⚠️ **And a counter-example that carries the design point: the UNC repository was in the unreadable list** — its item URL is a PDF download — **while publishing a feed with text.** For that family the feed is readable exactly where the item URL is not, which means a feed is not only a Mode B convenience; for repositories it is a *better acquisition path for the same document*.

**What this does and does not fix.** It does not rescue Mode R: one cannot subscribe to an arbitrary search result, so the 80% loss on a generalist query stands. What it does is confirm that Mode B (§5) was underrated here — *"for a given reader often the best signal-to-noise in the whole system"* — and add **arXiv** as a substrate candidate in its own right: open, keyless, unwalled, and returning text where OpenAlex's DOIs return a landing page.

⚠️ *Two things to decide rather than drift into.* Preferring a known feed over a search result's URL, for certain hosts, means maintaining a **host→feed map** — which is a small index, and §5 says **no crawler, no index** as a standing constraint. Whether a per-source acquisition map is inside or outside that line is a boundary question, not an implementation detail. And feeds carry **abstracts, not articles**, so the thin-input finding above applies to this path too — with one real difference: an abstract arriving *as an abstract* is knowably thin, where a landing page is unpredictably thin, and only the first can be scored honestly as what it is.

### 5.2 The candidate funnel

Retrieval makes cost a design constraint in a way re-ranking never did: the engine now decides how many documents to *look at*, and every look that reaches an axis is an LLM call.

```
query → search results (cheap, many)
      → triage on metadata alone (title, snippet, domain, date — no fetch, no LLM)
      → fetch + extract the survivors
      → score on the axes (expensive, few)
      → compose, then surface
```

The triage step is new and load-bearing. It has no equivalent in the re-ranking design, where the candidate set was small and given. It must stay cheap and legible — a filter the user can inspect and overrule like any other (§1), never a silent second ranker.

**Fetch-and-extract already exists** as the eval harness's URL corpus builder, and was written as "the first piece of Mode B/C ingestion." v0.7 promotes it from eval tooling to a product organ: the harness and the engine share it.

#### Two objects, two regimes — the run report and the persisted window

Worth fixing before it is conflated, because conflating them loses one or the other *(2026-08-04, with the Sovereign instance via COORD)*.

- **The run report** — what this funnel produced *just now*: every candidate dropped, with the rule that dropped it, and the scored losers below the cut. **Legitimately item-by-item**: it tells the reader what was set aside from *this* digest and why, which is §1.1.
- **The persisted 30-day reject window** — kept so the editorial pass can audit its own biases (*am I systematically rejecting this topic, this source?*). **Aggregate only, and hardened**, because a store that can answer per item about months of rejections is a behavioural profile by another name.

The hardening is not one rule but three, each closing what the previous leaves open:

1. **Aggregate by topic, source and rejection reason** — never item-by-item joined to opened/read. If the audit path only ever sees counts, it *cannot* learn per-item preferences, even if someone later wanted it to. Discipline is a promise about code; this is a barrier.
2. **A cardinality floor.** Aggregation alone is not a barrier: a cell of size one *is* the item, and five entries a day over thirty days produces plenty of them. Below *k*, a cell folds into an "other" rather than being served.
3. **No per-cell time series on the current window.** A sliding window read two days running yields its difference, and **the difference between two floored aggregates is the item that entered or left** — reconstruction by subtraction, which defeats the floor. One aggregate per window.

Rule 3 costs the audit nothing it needs — *systematic rejection* is a property of the whole window, not a daily curve — and it costs the **editorial** path nothing at all, because the editor reasons about what was *surfaced*, a different object, which it reads item by item and legitimately so.

**Drift is still detectable**, without reopening any of this: compare two **disjoint, closed** windows, each floored independently. The difference between consecutive days of a sliding window is one item; the difference between two closed months is a change of mass from which no item follows. You learn *this source fell below the threshold*, never *which one left*. The leak is in the granularity, not in the comparison.

**Three degrees of invisibility, three instruments** *(2026-08-04, worked out with the Sovereign instance)*. Something can fail to reach the reader in three different ways, and no single counter sees more than one of them. Conflating any two loses one:

1. **Never returned by the substrate.** No row anywhere — nothing witnesses it, by construction. Only an **active probe** finds it: deliberately query for a source one expects and note its absence.
2. **Returned, never examined** — `over-budget`, `unreadable`, `no-title`. A row exists. This is the **plumbing counter**: by source, with no *topic* dimension. Few cells, so the floor is harmless, and it says nothing about the reader's tastes — it reports the state of the pipes. The question it answers is not *what does the editor dislike* but *what never reaches him*.
3. **Examined and declined** — below the cut, declined by the editor, `retracted`. This is the **judgment window**, floored and folded as below.

Degree 2 turns out to be a partial instrument for degree 1, which was obvious to nobody: a source returned and then systematically cut at the fetch budget is the *borderline* case of one never returned at all. The probe is still needed for the true zero, but the plumbing counter catches the step before it — a source the engine ranks so low it never reaches examination.

⚠️ **The budget cuts on the substrate's ranking, not ours.** Triage consumes results in the order the adapter returns them, so what falls under the cap is not what *we* down-ranked — it is what the **search engine** ranked low, imported unexamined. That is exactly the category nobody can see from downstream.

**A fourth degree: examined, judged acceptable, and beaten** *(the Sovereign instance, 2026-08-04 — asked as a question, and the answer changed the taxonomy)*. The digest is finite, so an item can be good and still lose its slot to a better one. Over thirty days, a source that arrives sixth every night is neither never-returned, nor never-examined, nor declined. **It is beaten**, and *declined by the editor* does not cover it.

Checking the code split it further than the question asked. There are **three distinct acts** inside what degree 3 called "examined and declined":

1. **Beaten at the funnel's cut** — the axes scored it, it ranks N+1, **the editor never saw it**. This is `belowCut` in the run report.
2. **Beaten at the editor's cut** — it was in the slate of ten to twenty, the editor read it and chose five others. No reason: it lost.
3. **Refused by the editor**, with a reason: redundant, repeats Tuesday's, a bad slate-mate.

Only 3 is an active refusal. **The consequence is a contract change, not an extra counter:** 2 and 3 are indistinguishable *by construction* if the editor returns five items and nothing else. Everything outside the five is undifferentiated unless the editor is asked to mark which — cheap now, unrecoverable later. So **the editorial pass's output must distinguish *beaten* from *refused*** (§5.6).

**And the three degrees are relative to an examiner.** The same item is *examined and set aside* for the axes and *returned, never examined* for the editor. The ladder is not walked once — **it repeats at every stage that examines**, which is the sharper form of "one counter per way of disappearing": one *ladder* per examiner. Since the editor now issues its own queries (§5.6), it has its own substrate, its own budget and its own invisibles, and this stops being a tidying remark.

⚠️ **The instrument is the margin, not the rank.** *Sixth every night* is not an anomaly in itself: a source can be solid-without-being-first, and ranking it sixth is then **correct**. Counting sixth places would manufacture the very bias the counter exists to detect. What carries signal is **how narrowly it lost**: sixth by two hundredths, repeatedly, is being cut by noise; sixth by fifteen points is a judgment that holds. So the fourth counter is a **distribution of margins**, and the anomaly is a *small* margin repeated.

This is also self-limiting, which the cardinality floor needs: the great majority of below-cut items are far below and contribute nothing, so only near-misses accumulate and the cell count stays low by itself. **The margin must carry `degraded`**, or it conflates two different losses — a candidate whose gate could not run and which lost by a hair may have lost for want of a measurement rather than for want of worth, and that is the editor's call (F13), not the counter's.

**Only judgment-class rejections go in the judgment window** *(2026-08-04)*. The funnel's reasons are different species, and conflating them was mine to catch — as was omitting `unreadable` from the classification entirely on the first pass, which is the same way of losing a trace one layer down:

- **Mechanical** — `duplicate`, `over-budget`, `no-title`, `unresolvable`, `unsafe-address`. Properties of a URL or of a run's budget, **not judgments about a source**, and they dominate the distribution: deduplication and the fetch cap fire constantly.

  ⚠️ **`unsafe-address` is a different question from `unresolvable`, and gets its own reason** *(built 2026-08-04)*. `unresolvable` asks whether a link can honestly be **shown**; this asks whether **fetching** it reaches somewhere it should not. **A result URL is untrusted input** — anyone who can get a page indexed influences what a search returns, and this funnel fetches what returns — which had been treated as provider data until the Sovereign instance's question about their own SSRF guard surfaced it. Note where the guard does *not* belong: the configured `baseUrl` of a self-hosted engine, where loopback is the **expected** value. A guard there would not merely fail to protect, it would break the self-hosted path, which is the protective default; guarding the wrong surface is worse than not guarding.

  *Two measurements shaped the implementation rather than assumptions. The URL parser **normalises encoded IPv4 for us** — `2130706433`, `0x7f.0.0.1`, `017700000001`, even `①②⑦.0.0.1` all arrive as `127.0.0.1` — so the defensive decoding this would otherwise need does not need writing. But normalisation **cuts the other way for IPv4-mapped IPv6**: `::ffff:127.0.0.1` is stored as `::ffff:7f00:1`, where the loopback is no longer legible, so a check looking for a dotted quad after `::ffff:` would miss every mapped address the parser has touched. And `http:///path` is not malformed — it becomes `http://path/`, a registrable name — which is the opposite of the natural assumption and was caught by a test failing.* A source set aside forty times as a duplicate is not being rejected, it is being deduplicated — counting it as rejection manufactures a bias that does not exist, and pads cells with noise that keeps the uninteresting ones above the floor while the interesting ones fall below it.
- **Judgment** — below the cut, declined by the editor; plus `retracted`, which is a fact about the document.

So the persisted window holds the second species only. The window shrinks sharply — a free privacy gain — it carries exactly what the audit exists for, and the taxonomy collapses to two or three values, which is what a cardinality floor needs. Mechanical drops stay in the **run report**, item-by-item and ephemeral, where they are useful to the reader for *this* digest.

⚠️ **The floor hides preferentially what the audit is looking for** *(the Sovereign instance, and it is the sharpest point in the exchange)*. Rare cells fold first — and a rare rejection reason **is** the anomaly. An installed, massive bias survives the floor; a strange isolated one vanishes into "other". The mechanism protects best where it serves least.

The answer is that **folding must obscure the identity, never the existence**. An "other" carries its count of folded cells per reason: *three sources declined for this reason, each too few times to be named.* The audit learns that something unusual is there without learning where, and can ask for a longer window, in which a real pattern will populate. Anything less is a silent cap under another name — the thing this funnel already refuses one section above.

**And the reject window cannot see the worst blind spot at all.** A rejection reason exists only for what *entered* the funnel; a source the search substrate never returns produces no row — not even a "never proposed" one. *Always rejected* and *never offered* are indistinguishable downstream, which is Crabe's `not_run ≠ zero` one layer up. Measuring it needs an **active probe** — deliberately querying for a source one expects and noting its absence — not a passive journal. Owed, not built.

#### What the funnel keeps — store our judgment, not their results

A daily digest (§5.5) must hold something between the overnight search and the morning read. **What it holds is deliberately narrow: the URL, the title, and our own axis vector with its reasons. Provider snippets are used for triage and then dropped.**

This began as a licensing constraint and ended as a better design. Brave's documentation states that storing API results in whole or in part requires a plan that explicitly grants storage rights — **unverified**, because the API agreement sits behind the developer dashboard and is not publicly reachable (five documented URLs, all 404 or silent on the point). Rather than let an unreadable clause decide the architecture, the funnel is built so the question does not arise: we never retain the provider's expression, only facts about a public page and judgments we produced ourselves.

Three reasons it is the right shape regardless of how the clause reads:

- **It survives any provider.** A storage rule we cannot read cannot break us, and swapping backends (§5.1) carries no licensing tail.
- **It is the rule we already keep.** The consumption log stores a structured summary and never raw post text. Retaining a provider's snippets would be the same act under a different name.
- **The reason shown to the user is ours anyway.** §1.2 requires every surfaced item to carry *its reason* — which is our axis vector, not somebody else's description. A digest entry needs a title, a link, and why it is there.

*Consequence to accept honestly*: the digest cannot display a snippet it did not keep. Either it shows title plus our reasons, or it re-fetches the page at read time for a preview. The first is cheaper, more on-spec, and the assumed default.

### 5.3 The query — where does Spotter look? *(new in v0.7; base case decided, the hard case still open)*

Re-ranking never had to answer this: the platform chose what to show and Spotter reordered it. Retrieval cannot start without a query, and **nothing in this spec says where queries come from.** This is the largest open question v0.7 creates, and it decides the character of the product — a system that searches your declared topics is a very good clipping service; a system that searches for what would *change your mind* is the thing this project claims to be.

Candidate sources, not mutually exclusive:

- **Topics from the preference doc.** Already exists, immediately usable, and the narrowest: it can only return more of what you said you liked. Feeds Relevance well and Novelty badly.
- **Standing queries the user writes.** Explicit, inspectable, maïeutically clean — the user authors their own reach. Cheap to build. Puts the work on the user.
- **The frontier / known-set, inverted.** Query *away* from what the consumption log says you have already seen. This is what makes Novelty an active axis rather than a passive filter.
- **The stance model, inverted (§3.1).** Query for well-made arguments *against* positions you hold. This is the only source that can serve Challenge, and it is the privacy-heaviest by a distance: it means a model of your beliefs is generating outbound search traffic. Topic-partition (§3.1.4) was written as an egress control for scoring; used for query generation it needs re-examining, because a query *is* egress, and it leaves the device by construction — there is no local-only version of asking a search engine something.

**Decided: onboarding seeds both, in one gesture.** Onboarding survives the retrieval turn and gains a second job. It proposes **topics**, then, per topic, **articles the user rates** — and that single pass produces two artifacts at once:

- the **topics become query seeds** (Mode R's starting point), and
- the **ratings become the calibration band for that topic** — which is exactly the shape §2's Calibration gate needs, a band per *(user, topic)* pair, and exactly what the expertise map (§3) was specified to hold.

This is economical in the right way: the user does one thing, and the system learns both where to look and at what altitude to look there. It also means calibration arrives *with* the topic rather than being inferred later from behaviour — authored, not observed, which is what §1.3 requires.

⚠️ **The anchoring caution from §3.1.3 applies here and must not be waved through.** *Suggesting* topics is not eliciting them: a checklist manufactures interests the same way a checklist of beliefs manufactures positions. The suggestion set is a strong prior on where Spotter will ever look, so it should be broad, visibly incomplete, and always easier to overwrite than to accept. The user must be able to write a topic the list never thought of, and the interface should invite that rather than tolerate it.

**Still open, and it is the hard half (F9).** The above covers Relevance and Calibration — it can only return more of what the user already declared. It does not answer where a **Challenge** query comes from, and that one carries a tension §6.1 does not reach: scoring an intimate axis could default to local because the judgment happens on-device, but **a query is egress by construction**. Any retrieval driven by the stance model tells a third party something about the user's beliefs, whatever backend scores the results. There is no local-only form of asking a search engine something.

The preference doc therefore acquires a second role it did not have: it is no longer only an input to scoring, it is a **source of reach**. Anything written into it widens or narrows what Spotter can ever find, which raises the stakes of how it is authored.

### 5.4 Re-leveling by retrieval — the remedy Calibration implies

Calibration (§2) only *demotes* an off-band item. But an off-band item often carries real value buried at the wrong altitude — a lay-level post in your field with one fact you didn't have; a paper you can't spend the hours on today. The remedy is **not summarization** — Spotter never rewrites or transforms content (that would make it an author and risk the exact slop we refuse). The remedy is to **retrieve a *different published document* on the same subject, pitched at the user's band**: tweet → Medium post → the underlying paper (up); science paper → vulgarisation article (down).

This is a capability of Mode R (Retrieve): "find the right-altitude treatment of topic T" is a query like any other, so it needs no machinery beyond §5. Detector → remedy: Calibration finds the mismatch, Retrieve acts on it. Under v0.7 this stops being a distant capability — it is the same organ the product already runs on.

Three guards, non-negotiable:

1. **Retrieve, never rewrite.** The alternative is a real published artifact by a real author. Spotter ranks and points; it does not generate.
2. **Provenance is preserved and visible.** The re-leveled item carries a link back to the original it is a treatment of. Both are shown; the original is never silently replaced (§1).
3. **Down-leveling must clear the reliability bar we compose from Crabe's vector.** Direction is asymmetric: *up-leveling* moves toward the source (more rigor, more provenance) and is low-risk; *down-leveling* moves toward interpretation and can swap a rigorous finding for distorted spin. **Default bias: when in doubt, prefer the more authoritative re-level (up) over the more accessible one (down).** This is the point where Crabe stops being a v2 convenience and becomes load-bearing.

   ⚠️ **And on the local path there may be nothing to clear** *(measured against their shipped code, 2026-08-10)*. `lateral` — Crabe's only `retrieved` axis, the one carrying real citations — **cannot run under Ollama**: the provider has no search tool, so the axis reports `not_run` with its reason rather than silently reaching for a cloud provider (their choice, and the right one). A user on the protective default therefore gets `assessed` and `recalled` only. *Deciding to offer a down-level on that basis is a different decision from deciding it on `retrieved` evidence, and this guard does not yet distinguish them.* Open, and it belongs to both nodes.

4. **The link must be real, durable, and resolvable before it is offered** *(v0.7, from the Crabe instance via COORD)*. A re-leveled alternative is only worth anything if the user can open it — now and in six months — and if we could check where it points before proposing it. This disqualifies a whole class of source:

   > **Gemini grounding citations are not URLs.** They are `vertexaisearch.cloud.google.com` redirects whose `title` carries only the domain, which **expire in roughly 30 days**, and which Google's terms **forbid resolving programmatically** (stated penalty: the application loses redirects altogether). Measured live by the Crabe instance, not read in a blog. Anthropic's web search returns the real destination URL — non-expiring, freely resolvable.

   So: **any retrieval path must expose the true destination**, and a candidate whose target cannot be resolved and shown does not get offered. Crabe carries this as a `directLink` field plus an `isProgrammaticallyResolvable()` gate every fetch path must pass; the pattern ports here unchanged, and §5.2's funnel is where it belongs — a link we cannot resolve fails triage, before it costs an LLM call.

   This is §1.2 (*every surfaced item carries its reason*) reaching one step further: an item whose provenance we cannot show is an item we cannot honestly surface.

### 5.5 Delivery — a finite daily digest *(decided, v0.7)*

Retrieval has no inherited surface, so the shape of the output is a design decision rather than a given. It is settled:

- **Spotter searches overnight; the user reads during the day.** Retrieval is a batch that runs while nobody is waiting, not a thing that happens while you watch.
- **The result is a finite list — *at most* 5, not 5.** A ceiling, never a quota. Some days three things deserve the user's attention, and on those days the digest is three. Filling to five with the least-bad remainder would be the quota reasserting itself, and a digest padded to length teaches the user that its length means nothing. What decides the actual number is the editorial pass (§5.6).

**Finite is the whole point, and it is a structural answer to the *paradoxe addictif* (PHIL-0004, §1).** A digest that ends cannot become a feed. Every anti-extraction commitment in this document is about what Spotter *filters*; this is the first one about what Spotter *is*. A system that refilled itself as you read would have reproduced the mechanism it exists to refuse, however good its filtering — and it would have done so while claiming the opposite, which is worse. Selection therefore becomes **top-N**, not "everything above a threshold": the cap is the feature.

**Nothing hidden, still (§1.1).** A finite list means most of the haul does not surface, which makes "show me what you held back, and why" load-bearing rather than a nicety — the *Held back* surface already built for gate demotions is where the rest of the night's work belongs.

**Two consequences worth stating, because they are not obvious.**

**1. The latency constraint dissolves, and with it the reason for the fast/slow model split.** The two-LLM topology exists because per-post scoring had to keep up with a scrolling thumb. Nothing scrolls at 3am. Overnight, the better model is simply free to use — measured on the Pollution axis, the 7B local model roughly halves the error of the 3B (MAE 16.5 vs 33), and that improvement previously cost latency nobody wanted to pay. It now costs a few minutes of a sleeping machine. **Re-examine the model choice for the retrieval path on quality, not speed.** The fast/slow split survives only where something is genuinely waiting — chat, and the legacy feed surface.

**2. The extension body cannot honestly promise a nightly run — so it degrades, in a stated order.** An MV3 service worker is evicted aggressively and `chrome.alarms` only fires while the browser is alive; a laptop shut at midnight does not search. Rather than promise a 3am batch and quietly fail it, the trigger falls through three tiers:

1. **Overnight, if the machine is up.** The intended case.
2. **On the first browser interaction of the day.** The service worker wakes on any event; it compares the last run to today's date and, if stale, starts the batch. This is *more* reliable than a scheduled alarm, not less, because it depends only on the user showing up — which they must do anyway to read the digest.
3. **Manually, or by a companion app.** An explicit "search now" control always exists; and a small local process running a cron job removes the dependency on the browser entirely.

Tier 3 is worth reading as what it is: **a first taste of Sovereign**, not a workaround. The ladder climbs toward the same place — a background task that is a first-class citizen — so the three tiers are one design at three levels of installed commitment, not three unrelated hacks.

⚠️ **Tier 2 partly re-introduces what tier 1 dissolved.** If the batch starts when the user opens their browser, someone *is* waiting — so the run must be non-blocking and announce itself when ready (a badge, a notification), never hold a surface hostage. The conclusion above still stands, because the user is not watching each candidate score the way they watched a feed scroll; but "nobody is waiting" becomes "nobody is waiting *on any one item*", which is a weaker claim and should be designed for rather than assumed.

Whatever the tier, **say which one ran.** A digest from three days ago presented as today's is the silent-staleness failure this document refuses everywhere else.

### 5.6 The editorial pass — a librarian, not a ranker *(new, 2026-08-04)*

Everything up to here scores an item **in isolation**: the axes judge one document against the user model, and composition turns that into a number. Ranking those numbers gives an ordered list, and an ordered list is not yet a day's reading.

So the funnel's output goes through a second judgment — one LLM pass over the top ten or twenty, asking a different question: **what is genuinely worth this person's attention today?** It is not evaluative but *editorial*, and the distinction is the whole point. Where the axes ask *how good is this*, the editorial pass asks *given everything I have already put in front of you, and everything you actually read, does this earn a slot this morning?*

**It judges the slate, not the item.** Two things follow that no per-item score can express:

- **A superb article whose substance repeats one from two days ago does not run.** Ninety-nine percent overlap with something already delivered makes excellence irrelevant — the reader has had it.
- **A middling article — say it scored 16 — whose subject has not appeared in two months can be raised.** Absence is itself a reason. Nothing in a composed score can see this, because the score never looks at the calendar.

**This is what the number of items is for.** It is why the digest is *at most* five (§5.5): the editorial pass returns what survives its question, and some days that is three.

**The state it requires is new, and it is split by *actor*, not by shape** *(Céline, 2026-08-04)*. An earlier draft posed two journals — *proposed* and *read* — and then a ruling put reading signals on the document itself, which read like a contradiction to be arbitrated. It is not: the two objects answer to two different actors, and once that is seen the redundancy dissolves rather than needing a winner.

- **The journal of offers — what *Spotter* did.** Append-only, one entry per offer, carrying its date, subject, whether it was a labelled challenge, **and the surface that produced it**. Append-only because a journal that can be edited is not a journal; **repetition is native** here, which is exactly what a single timestamp cannot express. **Horizon: 12 months.** *Absence is a reason* needs months, not years; "this repeats something from two years ago" is not an editorial question, and an unbounded offer log would harden the reject side while letting the offer side run forever.
- **The reading signals — what the *reader* did.** Carried on the document, not as a reader→document edge: `proposedAt`, `openedAt`, an open count, `readAt`, `lastReadAt`. **Timestamps, never a status enum** — a state machine destroys the two things that carry signal, repetition and chronology. The status is read off whichever field is furthest along.

*`proposedAt` is on the document as well as implied by the journal. That is a cache, not a second source of truth: it is the earliest offer, and merge takes the earliest (§6.4). It is safe precisely because entries are recorded per surface, so nothing has to be reconciled across hosts.*

⚠️ **The editor gets a narrow capability, never the store** *(Céline, 2026-08-04)*. Both objects live in the same store under the same document id, so the join *"offered four hundred times, never opened, on these subjects"* is trivially available — and that join is exactly the comfort-filter trap named at the end of this section. A rule in a document is a discipline that falls in one commit. So the editorial pass is handed `everProposed(id)`, `lastProposedAt(id)`, `subjectLastSeen(topic)` — **and nothing else**. The join becomes *impossible* for it rather than forbidden. Same gesture as the aggregate-only audit path (§5.2).

⚠️ **The residue, and how far it was closed** *(with the Sovereign instance, 2026-08-04)*. The *mirror* must do that join — *"here is how much of what argued with you you actually read"* is journal(`challenge`) against `readAt`, and it is the whole point of §5.6.1. So the barrier is not *the join is impossible*; it is **the mirror may, the editor may not**.

It is hard on the editor's side, given the narrow capability. On the mirror's side it was first written as wiring — *the mirror has no outbound edge into composition* — and it can be made better than that, in **two parts that guard two different failure modes**:

1. **The module graph.** The join module is aliased out of the composition bundle, using the same `$host` mechanism §6.3 uses to separate hosts — an internal boundary of the same species. The guarantee stops being *no edge goes out* and becomes *the code is not in this binary*. Verified by the same bundle test.
2. **The message schema.** Module exclusion guards against the code being present; it does **not** guard against the data crossing. The dashboard *must* compute the join, and if it posts the result to the worker, no aliased module is involved and the barrier is passed without being touched. So: **no message type from the dashboard to the worker carries reading signals.**

The second is stronger than it looks, because MV3 already gives us a **process boundary** — the dashboard is a page, the worker another context, and they communicate only by messages. That surface is finite and enumerable, so it is checkable exhaustively rather than by inspecting a call graph.

⚠️ **But it is only enumerable if the set is closed at the *receiver*** *(the Sovereign instance, 2026-08-04)*. `postMessage` accepts any cloneable object, so a list of message types describes what the sender habitually sends, not what the worker will accept. The hard form belongs to the worker: **validate against a closed set and reject any unknown shape.** The surface is then finite because it refuses to be infinite, rather than because nobody happened to write the other call. This is `not_run ≠ zero` one layer down — the unforeseen is *refused*, never *let through*. *It is also the exact defect Crabe found in `compose()`: the exclusion rule was right on paper while the code let an `ok: false` axis into the average. Enumerable by convention against enumerable by enforcement.*

**And the rejection must be loud.** A worker that silently drops an unknown shape is fail-closed for security and **fail-silent for correctness**: the day someone legitimately adds a message type it vanishes without a trace, the symptom reads as *"the feature doesn't work"* rather than *"the barrier refused it"*, and it gets worked around by whoever hits it without knowing why — which is the only way a barrier of this kind actually dies. Reject **and** surface. §1.1 applied to our own plumbing.

**What remains uneven, and it belongs in the capability manifest (§6.3).** Sovereign can make the illegal state *unrepresentable* — the Control Plane / Data Plane pattern, where a capability does not exist in the wrong plane at compile time. TypeScript types erase at runtime, so that route is not available in the browser. The real gap is therefore *type-level unrepresentability* against *an enumerable message surface* — a difference of degree between two structural barriers, not the difference between a barrier and a convention. It still lands on the most intimate artifact, which is why the manifest must declare **the nature of each guarantee, not only its presence**.

*To be measured, not assumed: whether `@crxjs/vite-plugin` emits genuinely disjoint bundles per MV3 entry point, or shared chunks that could place the join module within reach of both. The bundle test catches that case — it verifies the result, not the alias.*

**The figure is a librarian, or a journalist compiling a specialised press review for one named reader.** Not an engine ranking documents — someone who remembers what they handed you last week, notices you have heard nothing about a subject since spring, and has a view about what you should see this morning. That is a stronger claim of judgment than anything else in this document, and it earns two guards.

**It also inherits the unchecked-item question (F13).** A candidate whose pollution gate could not run arrives ranked on the axes that did work, flagged `degraded`, and carrying the names of the gates that did not — and the editor decides whether it earns a slot regardless. That judgment is only possible here: *is this worth surfacing unverified* has no answer in isolation, and a complete one the moment you can see what it would displace.

**And it issues its own queries** *(Céline, 2026-08-04)*. On the basis of the day's candidates, the editor searches — for a contradictory viewpoint, for the treatment at the right altitude, for whether a subject has moved — and arbitrates on the composed scores **together with** what those queries return. It is therefore not a selector sitting above the funnel: **it is a second funnel**, and the digest's cut happens after a round that can *add* candidates rather than only prune them.

Three things follow, none optional:

- **Its queries obey everything §5.1 and §5.3 impose on the first round** — the substrate requirements (no personalisation, no forced ads, resolvable destinations), the rotation across generalists (F12), and above all the egress rule of §5.6.1: *"strong arguments against carbon pricing"* is permitted, *"arguments against this user's stated position"* is not. A second retrieval round is a second disclosure surface, and it is the one closest to the stance model.
- **The three degrees of invisibility apply to it** (§5.2). It has its own substrate, its own budget and its own blind spots, and nothing the first funnel's counters record says anything about them. This is where "one ladder per examiner" stops being a tidying remark.
- **Cost is affordable here and nowhere else.** These are extra LLM calls and extra fetches, on a machine nobody is watching (§5.5). The same design in front of a scrolling reader would be indefensible.

⚠️ **It must explain its refusals, not only its picks — and *beaten* must read differently from *refused*.** *"I skipped this excellent piece because it repeats Tuesday's"* is precisely the reason §1.1 requires to be recoverable. But an item that simply lost its slot to a better one has no such reason, and recording it as if it did would invent a judgment nobody made. So the editor's output marks which of the two happened (§5.2, the fourth degree), and the *Held back* surface carries both classes: items it **declined**, with the reason — the interesting one — and items it was **beaten** by the slate, with their margin.

⚠️ **The read-log must not quietly tune it.** This is the sharpest risk in the design. A layer that learns from what you open will learn that you rarely open the things that contradict you, and will stop offering them — and it will have become a comfort filter while every axis still reports working correctly. That is the engagement trap re-entering through the one door left unguarded. §1.3 already governs the case: implicit signals may only ever *propose*, never silently edit the user model. The read-log is an implicit signal. It informs the editorial pass's view of *redundancy*; it must not be allowed to reshape the user's *taste* without a changelog entry the user approves.

### 5.6.1 Challenge, and the rule that keeps it usable

Challenge lives here, in the editor, rather than in a query. Two ways it gets its material, and they carry different exposure:

- **By selection**, locally, from a pool retrieved for other reasons. The stance model reads the candidates on the user's own machine and never leaves it — no disclosure at all.
- **By the editor issuing its own queries** for off-topic material or contradictory viewpoints. This does leave the machine, but note the gradient: *"strong arguments against carbon pricing"* discloses a subject; *"arguments against [this user's stated position]"* discloses the user. The first is ordinary curiosity of the kind any reader might type; the second is the stance model on the wire. **Only the first form is permitted**, and the difference is not stylistic — it is the whole of what made F9 hard.

**The rule that makes a challenge usable rather than merely uncomfortable: a challenger may be off on _one_ axis, at most — never several, and never all.**

A piece that contradicts the reader's position must still be relevant, well-calibrated, substantive and clean. A piece pitched above their level must still be on a subject they care about and well made. What is forbidden is the combination: off-topic *and* over their head *and* thin *and* contrarian is not a challenge, it is noise wearing the badge — and it is what a lazy challenge feature degenerates into, because anything at all can be justified as "challenging".

This is the calibration band (§2) applied to disagreement: **stretch on one dimension while everything else stays comfortable**, or the reader has no footing from which to engage. It is also mechanically checkable — the composed vector must show exactly one axis below its threshold — which means the rule can be enforced rather than merely intended.

**Challenges are labelled as such.** Never smuggled in among the ordinary picks. The reader should know they are being handed something that argues with them, and be free to decline it — a challenge slipped in unmarked is manipulation, however good the intention.

**And what happens to it is recorded — for the mirror, not for the filter.** Whether the reader *opens* a challenge says little; **clicking is not reading**. What is kept is `openedAt`, an open count, and a `readAt` set by **an explicit gesture of the reader** — never a timer, a scroll position or a dwell measurement. It is surfaced on the dashboard: *this is how much of what argued with you, you actually read*. That is the *méta-miroir*.

⚠️ *An earlier version of this section said depth of engagement was **measured**. The observation behind it was right — clicking is not reading — and the instrument reached for was wrong. What settles it is re-pointability: a stopwatch running on whatever is on screen serves the mirror and would serve anything else just as well, whereas a "read" gesture re-points at nothing. That is the same test this project applies to search engines and to dual-use technology (`claude-technique.md` §11.8), applied here to something we would build ourselves rather than to somebody else's tool. An explicit gesture also serves the reader: she remembers what she read.*

⚠️ **This resolves the guard raised against §5.6, and the resolution is worth stating because it is easy to lose.** The danger was that a layer learning from what you open would learn you rarely open what contradicts you, and quietly stop offering it — a comfort filter with every axis still reporting green. The answer is the direction the signal travels: **read-depth goes to the mirror, never into the ranker.** It informs the reader about themselves; it does not inform the system about what to stop showing them. Any future change that lets engagement data feed back into selection re-opens the trap, and should be treated as a change to §1.3 rather than a tuning detail.

*This is also the one place data collection is warranted under the standing rule that it is banned absent a verified need and clear consent: the need is the reader's own self-knowledge, the consent is explicit, and the data never leaves the device or reaches a scorer.*

## 6. Standalone-first architecture

Hard requirement: **Spotter ships and runs as a browser plugin before any Sovereign integration.** Therefore:

- **Host-agnostic core** (pure TS, no browser or Sovereign deps): value engine, six-axis scorers, user models, composition policy.
- **Host adapters**: `BrowserHost` (extension — host #1) and `SovereignHost` (orchestrator task — host #2). Same core under both.
- **Storage interface**: IndexedDB now, SurrealDB (via `sovereign-db`) later, behind one interface.
- **Search and fetch are host capabilities, not core ones** *(v0.7)*. The core decides *what to ask for* and *what to keep*; issuing the query and fetching the document belong to the host, which is where the credentials, the CORS surface, and the network policy live. Same split as the LLM backend (§6.1): the core is handed a capability, it never reaches for one.
- **Encryption at rest moves from TODO to required** — the stance model means Spotter now stores a model of the user's beliefs. Mirror Sovereign's posture (XChaCha20-Poly1305, per-document keys).

In Sovereign, Spotter is the orchestrator's **attention-allocation task**, not merely an Observe-level skill — see the note in §7.

**The negotiation frame, set by Céline (2026-08-04):** Spotter is **entirely responsible for the extension version**; the **Sovereign version is negotiated with the Sovereign node**, and **the gap between them must be minimal**. That last clause is not a wish — §6.3 gives it a test that can be applied to any proposed divergence.

### 6.1 Model backend — user-chosen, BYO-key

Following Crabe's dual-backend pattern, the LLM is **user-chosen**, not fixed: cloud (Claude or Gemini, user-supplied credentials) or local (Mistral / qwen via Ollama). The POC's `ollama.ts` becomes a **provider interface** with Ollama / Claude / Gemini implementations behind one shape — essentially Crabe's existing abstraction, ported rather than reinvented. This decouples feasibility from local-small-model capability: capability becomes a dial the user sets, and the system rides the bet (shared with Sovereign's hot-swappable orchestrator) that local models keep improving.

**The privacy/backend collision.** Cloud mode is clean for the axes that need only the post plus topic prefs (Relevance, Quality, Pollution). It is **not** clean for the stance-dependent axes: scoring Challenge means conveying the user's *positions* to the provider — handing a model of their beliefs to a third party. This is a deeper exposure than Crabe's (which sends a page to classify, never a model of the user).

**Resolution — protective by default, opt-in by the user, per provider.** The backend is chosen **per axis, per provider.** Stance-dependent axes (Challenge, and any use of the stance model) **default to local** — least-leak, zero configuration, the path of least resistance points the safe way. Cloud judgment of those axes stays *available* as an explicit, revocable opt-in. Three conditions keep that choice real rather than nominal:

1. **Never silent.** Opting an intimate axis to a cloud provider shows exactly what leaves and to whom ("this sends a model of your positions to Anthropic") and is revocable at any time. The stance model never reaches a cloud API as a side effect of a global setting.
2. **Per provider.** Trusting Anthropic with your positions is not trusting Google with them. The provider abstraction carries a per-provider, per-axis trust setting; it does not collapse "cloud" into one bucket.
3. **The trade is shown, and valid only for that user.** The eval harness quantifies what cloud judgment buys over local on each axis, so the user trades concretely ("this much better, for this exposure"), not blind. One user's willingness to trade is never a product default or endorsement — the system defaults to the protective position and lets each user move their own line.

This is the Directive Maïeutique applied to the privacy choice itself: a *protective* default that refused to let the user trade would be substitution too — taking the call away — just better-dressed than the leak. The system surfaces the real trade and lets the user own it.

### 6.2 Storage — the judgment record *(agreed with Sovereign and Crabe, 2026-08-04)*

The three nodes converged on one shape, and it is a contract rather than a Spotter preference.

**A judgment is its own record, not a field set on the document.** Sovereign's first design carried Crabe's verdict as document columns (`reliability_score`, `reliability_assessment`, `assessed_at`); ours would have wanted a symmetric `attention_*` set, and the next judge another. Two reasons decided it: a judgment is **re-run** when the model or the preferences change while the document does not, and a record keyed by *(document, judge)* lets several judges coexist without the schema growing a field family each time. It also happens to absorb multi-*device* for free (§6.4), which nobody designed for.

**The document keeps only a recomputable cache** — and the cache is *the shape this judge can produce, not a fixed column of the schema* (Crabe's rule, retained). No invented composite, and it must be what filtering actually runs on. For Spotter the question largely dissolves: if only surfaced entries enter the base, sorting five items a day needs no denormalised column at all.

⚠️ **`degraded` is declared by the judge and never computed by the storage layer** *(Céline, 2026-08-04 — the strong form of Crabe's reserve)*. Only a judge knows which of its own states mean *I could not look*; a storage layer could only infer it from the payload, and inferring correctly today guarantees nothing about tomorrow's contract — which is precisely what had just happened once in this exchange. It is also the shape F13 requires: **the storage layer records, it does not decide.**

**Three fields the current record is missing**, found by auditing it against this contract rather than by using it:

- **`judge`.** Implicit while Spotter is alone with its own store; false the moment a record lands in a base where Crabe's assessments also live — which is exactly what import does.
- **A fingerprint of the composition policy.** §4 makes composition a policy the *user* owns and edits, and the ruling above requires the cache to be **recomputable**. Two judgments with the same model and different weights are currently indistinguishable, therefore not recomputable.
- **The challenge cursor value that produced the challenge axis.** Sovereign withdrew its neutral-reference scheme on the grounds that *comparability comes from the fingerprint* (§3.1). Without the cursor in the record it comes from nowhere.

**The journals are split by volume, not by nature** *(Céline's architecture, 2026-08-04)*. The earlier proposal cut by nature — the offer stays with Spotter, the action enters Sovereign — and volume is the better axis:

- **One Spotter thread**, generic or per-subject at the user's choice.
- **Only what the editorial pass surfaced enters the base**, as `is_owned: false` (§5.2 of `claude-technique.md`: retrieved content is never the user's own). The set is bounded — at most five a digest — so it does not pollute the Digital Master.
- **User signals ride on the document** (§5.6), with no reader→document edge and no separate event stream.
- **The reject window stays with Spotter**, on its 30-day sliding window (§5.2).

*The objection this replaced — "most of these pages will never become Documents" — aimed at the right danger and cut in the wrong place: it stops being true once only surfaced items enter.*

### 6.3 One source, four builds — how the versions diverge *(decided 2026-08-04)*

The same source produces the Chrome, Firefox and Sovereign versions. Sovereign is **a fourth build target**, not a fork. What makes that non-trivial is Céline's constraint:

> **The Sovereign code must not ship with a disabled flag.**

**Why that is the right constraint and not fastidiousness.** Inert code is a **re-pointable capability** — the test this project applies to search engines and to dual-use technology (`claude-technique.md` §11.8), turned on our own binary. And on the persisted challenge cursor (§3.1), which is the register of tender points, the difference between *absent* and *present-but-off* is the difference between a barrier and a promise. It is *hard barriers over trust* applied to ourselves rather than to somebody else's tool.

**The unit of divergence is a capability, not a feature.** This falls out of §6's existing shape: the core is **handed** capabilities and never **reaches** for one. A host that lacks a capability does not declare it; the core never sees it. No feature flags, because there is nothing to flag.

**Mechanism: a `$host` alias resolved per build in `vite.config.ts` — not a conditional import.** The distinction is the whole argument. A conditional import resolves and bundles both modules and excludes one at runtime; with an alias, Rollup **never resolves** the other module at all. The machinery already exists (`process.env.BROWSER`, `build-chrome.js` / `build-firefox.js`).

**Verification, without which this is a promise again**: a build test that greps the produced bundle for a marker from the other host's module and fails if it finds one. A constraint nobody measures is an intention.

**Describing what is not there.** The extension must name *"available only in Sovereign"* without shipping what is absent. The answer is a **capability manifest**. Naming a capability does not implement it.

⚠️ **The manifest is *assembled* from the capabilities actually passed in — never authored beside them** *(2026-08-04, from the Sovereign instance's reserve on its own guarantee)*. Their finding was about their code and it lands here: a `Transport` is `(url, init?) => Promise<TransportResponse>`, and **that signature carries no information about what the transport guarantees** — a guarded, trace-free transport and a bare `fetch` are indistinguishable to the core. A manifest written as a separate document would therefore declare *"guarded"* while the wiring passed a raw fetch, and nothing would catch it. **That is the promise this document refuses everywhere else**, in the one object built to state the truth about guarantees.

So each capability **carries its own declaration**, and the manifest is an aggregation of what was handed in. This is not cryptographic and is not sold as such — a host can write a false declaration. But it moves the fault from *"someone forgot to update the manifest"*, which is silent, late, and the normal failure mode, to *"someone knowingly wrote a false declaration"*, which is visible in review. Same profile as `degraded` (§6.2): the storage layer records, it does not decide; here **the transport declares, the core records**. And a declaration derived from the thing itself cannot disagree with the wiring, because declaring and wiring become one act.

*Consequence for wording, borrowed from Sovereign: **"guarded retrieval", never "a host that owns a guard."** The first is a property of what is passed; the second is a property of something existing somewhere in a repository — which is a module name read in place of the thing, the failure that cost three corrections in one day.*

⚠️ **Each manifest line declares the nature of its own backing.** Under Sovereign a declaration can stop being data the host supplies and become a **type only the guarded path can construct**, so that possessing the value *is* the proof and the line becomes a consequence of the code compiling. In TypeScript it never becomes that: any object literal can carry `{ guarded: true }`. The assembled manifest improves the **failure profile** — silent omission becomes visible falsehood — it does not produce proof. **These are not two points on one scale: one is a proof, the other a better-instrumented convention.** A manifest aggregating both kinds without saying which is which presents as homogeneous something that is not — the defect this section exists to prevent, one level up. So a line states not only *what* is guaranteed and *on what footing*, but **where the assurance of the line itself comes from**: guaranteed by typing, or declared by the host and checkable in review.

**Four ways a capability-as-proof leaks, on four distinct surfaces** *(worked out with the Sovereign instance, 2026-08-04; carried here because COORD is deliberately uncached and this outlives the exchange)*. A type only the guarded path can construct proves the path was taken **once** — it must be a **chokepoint, not a certificate**:

| Surface | Leak | Closed by |
|---|---|---|
| Construction | **Forge** the value | Constructor private to the module; no `From`, `Default` or deserialisation reopening it |
| Exit methods | **Extract** its inside — an accessor returning the inner client, a `Deref` to it | The only public method is the one performing the guarded operation, indivisibly |
| Entry parameters | **Inject** a result into it — `get_with_addrs(url, addrs)` lets the caller supply their own classification | Validate, pin and re-check per hop as one gesture; never take the classification as a parameter |
| The contract itself | **Substitute** — if the capability travels as a trait or a bound generic, anyone can implement it and the type gates nothing | Seal the trait (private supertrait), or pass a concrete type |
| No surface at all | **Don't ask** — call the ambient directly. No value, no contract, no call site accepting anything | Module perimeter: forbid the ambient where the rule applies |

The first three assume you want *that* value; the fourth removes the need to have it; **the fifth never enters the system.**

⚠️ **The fifth is not hypothetical — it is the defect this project actually committed** *(the Sovereign instance's observation, 2026-08-04)*. The three search adapters called the global `fetch` from inside `src/core/`. They forged nothing, extracted nothing, injected nothing, substituted nothing: **they simply did not ask.** §6's rule — *the core is handed a capability, it never reaches for one* — is precisely the rule against this surface, and no type could have caught it because no type was involved.

**It closes two ways, and neither subsumes the other.** A **runtime trap** — replace the ambient with a function that throws, then perform a real operation — covers exercised code perfectly, because it observes behaviour rather than text; but a path no test walks is guarded by nothing. A **source check** covers every line; how well depends on what it reads. `test/search.ts` carries the trap, `test/capabilities.ts` the check.

*The check walks the **syntax tree**, not the text, which is stronger than the lint first imagined here. A textual rule matches its own vocabulary — it fires on `fetch` in a comment, in a string, in `DocumentFetcher`, and misses `globalThis.fetch`. An AST walk asks the question about the code rather than its spelling, and TypeScript is already a dependency so it costs nothing. **What it claims and no more**: it catches every accidental reach and no determined one. `globalThis['fet' + 'ch']` passes, which is fine — the failure guarded here is forgetting, not smuggling. Its file-scope shadowing rule over-approximates toward missing a reach, so the names it excused are **printed**, never silently swallowed.*

⚠️ **It found four more the moment it existed** — the three LLM providers, in seven places overall. The search adapters had been fixed because a question was asked about search; nobody checked whether the same defect lived elsewhere, and it did, in code carrying a heavier payload: an LLM call sends the document **and** the user model, which for the intimate axes (§6.1) is the largest disclosure in the system. *Written down because the sequence is the lesson: the rule was in this document, the fix had just been made one commit earlier, and four instances survived both until something mechanical looked.*

*And both must be automatic rather than discoverable. This defect was visible to a grep **nobody was going to run** — no one searches for `fetch(` inside a directory called `core/` without already suspecting, and what found it was a question about something else. A thing that is findable but not found is not defended.* **And the fourth is the dangerous one because it is the idiom** — passing a capability as a trait is the ordinary way to do this, so the natural slope destroys the property, and sealing is an explicit decision invisible in the signature and easy not to carry through a refactor.

*This is also the structural reason our form cannot be a proof, rather than a weakness of the language: **structural typing makes substitution the default behaviour.** Where a nominal type system lets you close it, TypeScript's semantics are that anything of the right shape is the thing. Better stated that way than as "TypeScript is less safe", which is true and explains nothing.*

⚠️ **The manifest declares the *nature* of a guarantee, not only its presence** *(the Sovereign instance, 2026-08-04)*. Some protections are structural in one host and merely verifiable in the other — §5.6's mirror boundary is the worked case: unrepresentable by type under Sovereign, an enumerable message surface in the browser. A manifest listing *what* a host can do without saying *on what footing* lets the user assume uniformity that is not there. This is Plan Visibility applied to our own guarantees.

⚠️ **And it declares per *artefact class*, not per host — because a host does not have one level of protection** *(2026-08-04, following a measurement by the Sovereign instance)*. Sovereign's embedded browser is built with no `data_directory`, no partition and no private mode, so its storage is the webview's default profile — **not** the field-encrypted store. Under Céline's ruling that Spotter-in-Sovereign keeps its haul in the browser context, part of Spotter's state therefore lands somewhere that "Sovereign host" does not describe. *(Whether the app's data directory is itself switched per persona was **not** established, and is not assumed here.)*

This exposes a modelling error that was ours: treating *host* as a single trust level, which `SpotterStore` also does by being a single seam — one abstraction over substrates with different guarantees is a container deciding a property of its contents, the defect this document refuses everywhere else. **The correction is a rule already written for export in §6.5, which turns out to be the special case:** *contents are bounded by the host's protection, not by what is convenient.* Applied to storage: artefacts are **classified by sensitivity in the core**, the host binds each class to a substrate, the manifest declares **per class**, and **a class a host cannot protect is not persisted on that host.**

⚠️ **The browser context is working memory, not storage — and the ruling that put the haul there had a second face nobody looked at.** *(Verified 2026-08-04: `sovereign_dir()` carries no persona component; persona separation is by filename in a shared directory plus distinct key stores, and the webview — created without `data_directory` — sits outside all of it.)* Céline's ruling that Spotter-in-Sovereign keeps its haul in the browser context was taken as a **substrate boundary**, and endorsed here for one property: it protects the Digital Master from filling with what the user never chose. The same boundary also **places the haul in the least protected substrate available** — unencrypted, unpartitioned by persona — and the haul is what Spotter searched for, hence derived from the topics and the preference doc, hence *what the user wants to know*. Two properties of one decision, one of them the reason for it.

So: **nothing from the run report is written to that context's storage.** It lives in memory and dies with the run. This costs nothing, because `RetrievalReport` is already a per-run object (§5.2) — what changes is its **status**: a convenience becomes a requirement, and a requirement gets checked.

⚠️ *This is the trap for the **margin counter** (§5.2, the fourth degree). It derives from `belowCut`, so the natural implementation accumulates it wherever the run happens — which is the browser context. It is a persistent behavioural record and belongs to the **protected class**. The mistake would have been made for the most ordinary reason: that is where the data already is when you compute it.*

⚠️ **The reject window is in the protected class, and this changes what its hardening was ever worth.** §5.2's floor, folding, disjoint windows and single-species rule all address **one** adversary: the audit path — *what our own code can learn*. **None of them protects against someone reading the file.** A cardinality floor is not encryption. The encrypted store was implicitly treated as the backstop for the second adversary and never written down as such, therefore never checked. *Two mechanisms, two threats, and not saying which each addressed is what let one be assumed to cover the other — `not_run ≠ zero` in a third disguise, where unmeasured reads as covered.* So on a substrate that cannot protect it, the reject window is **not persisted at all**; the mirror loses precision, which is the real cost and the right side of the trade. Céline's display rule keeps it from nagging: **once during onboarding, then in the meta-mirror if the user consults it** — which is the same surface that must already show under which regime each slice was recorded (§4.1). One place, two functions, and it is where the difference is actually felt rather than merely claimed.

⚠️ **The test that protects "minimal gap"**, and it is meant to be used against this document:

> *Could the browser host implement this safely, if someone wrote the code?*

If yes, **it is not a host gate — it is unfinished work**, and declaring it Sovereign-only would be capture dressed as architecture. Only capabilities the browser body cannot honestly hold pass: real background execution, cross-device state, the key hierarchy and guardian recovery, field-level encryption.

**The body.** Under Sovereign, Spotter is a bundle living in **Sovereign's own browser** (Céline: *"it exists, it is the most logical"*) — so no WASM and no Rust interop for now. What changes is the host adapter, which talks to Sovereign's APIs instead of `chrome.*`. *Stated plainly because it is the real work: `src/lib/` **is already** the browser host under another name — `chrome.storage`, IndexedDB, the service worker. The task is not to invent a host layer but to recognise the one that exists and give it a sibling.*

### 6.4 Several installations, and how they merge *(decided 2026-08-04)*

A user may run Spotter on Chrome, on Firefox and in Sovereign at once. **No base is authoritative, and they may diverge freely** — that is not a failure mode to reconcile. **There is no export from Sovereign outward**: the flow is one-way, by decision.

**Merging is purely additive, with or without deduplication at the user's choice.** Additive is a strong constraint in the right direction — no conflict resolution is needed — but it only works if identities are stable, which they are: `documentIdFor(cleanUrl(url))` was written for editorial redundancy (§5.6) and serves merge unchanged.

"Additive" then declines differently per field, and getting it wrong is silent:

| Field | Merge rule | Why |
|---|---|---|
| Documents | union by cleaned-URL id | the same page is one node |
| `firstFoundAt`, `proposedAt`, `openedAt`, `readAt` | **earliest** | first time it crossed any desk |
| `lastReadAt` | **latest** | most recent explicit mark |
| `openCount` | **sum** | twice on Chrome and once in Sovereign is three |
| Judgments | **keep all** | already keyed by judge, model, policy, date (§6.2) |

**And entries are recorded per surface** *(Céline)*. This is the rule that makes the rest safe, and it generalises something found piecemeal one layer down: **the plumbing counter (§5.2) must not merge across hosts.** *"This domain blocks our fetcher"* can be true on Chrome and false in Sovereign — permissions and network differ — and averaging the three erases a host-specific fact into a figure describing none of them, which is exactly what that counter exists to find. Recording the surface on every entry is the general form; the plumbing counter is one case of it.

⚠️ **One-way is a decision, and it has a cost worth writing down rather than assuming.** `claude-technique.md` §5.2 holds that a technology must stay *questionable, replaceable, **abandonable*** — and a one-way import is the shape of lock-in even when it is benign and nobody intends to use the exit. The answer may be that it does not apply: Sovereign *is* the sovereign store, the data is already on the user's machine and legible to her, and "export" there means little. If that is the answer it should be written rather than assumed; if it is not, symmetry is cheap now and expensive later.

### 6.5 The archive export *(Spotter's deliverable, shape decided 2026-08-04)*

A user of the extension who installs Sovereign must be able to **import their corpus** — explicitly **not** a synchronisation: one gesture, once. The same format doubles as a **backup** for whoever wants one.

⚠️ **Encryption is a host capability, and Spotter does not have one** *(Céline, 2026-08-04 — verified in the code: there is no crypto in `src/`, only a note that `documentIdFor` is deliberately not a cryptographic hash and a comment describing Sovereign's field encryption)*. §3.1's passphrase-derived key and §6's "encryption at rest becomes required" are **commitments, not present tense**, and an earlier draft of this section was written as though they had shipped.

**So "encrypted by default, plaintext an explicit choice" was wrong, and the correction simplifies rather than complicates.** In the browser host, plaintext is not a choice — it is the only available state. The archive is therefore **as protected as its host, and the host declares which** (§6.3's manifest, whose whole purpose is to state *the nature* of a guarantee rather than its presence). The core produces the archive; the host protects it or cannot. That is §6's existing rule — the core is handed capabilities and never reaches for one — applied to one more capability.

⚠️ **The rule that follows, and it is the load-bearing one: the archive's contents are bounded by the host's protection, not by what is convenient to move.** A host without encryption exports **less**. Concretely, for the browser host:

- **The stance model and the challenge cursor are not exported.** They are the register of tender points, and a plaintext file containing them is exactly the hole Céline flagged. What travels is documents, judgments, journals and reading signals — facts about public pages and about what was offered and read.
- **The cost, stated rather than discovered: moving into Sovereign means re-authoring the stance model.** That is unpleasant and it is not new policy — it is precisely the trade F7 already accepted (*passphrase lost = re-author*), applied to a different loss. Having ruled that the stance is rebuildable rather than irreplaceable, it would be incoherent to smuggle it out in the clear to avoid rebuilding it.

**Under a host that *does* have encryption (Sovereign), two further rules apply — and they are host rules, not format rules:**

- **The archive key is derived from the persona's own passphrase, never a fresh export passphrase** *(following the Sovereign instance's analysis of its own proposal)*. The reflex design for a portable backup is a separate passphrase chosen at export time, and it is wrong here for a specific reason: **an export passphrase is a second door to the real persona, and one the duress design does not model.** Per-persona key isolation protects against coercion applied to *the store*; it cannot protect an artefact whose existence it does not know about, and whoever can compel one passphrase can compel the other — at which point the decoy covers nothing. Cost: no restore without the original passphrase, and the file cannot be handed to someone else.
- Sovereign's warning holds whole: judgments plus the cursor sit **outside** field-level encryption once in a portable file. What is safe in a store is not safe on a desktop.
- ⚠️ **Encryption is necessary and not sufficient: the existence of the artefact is itself a signal.** An encrypted export is still an observable file — a large dated blob on a machine somebody is examining, saying *"this machine holds something other than what you are being shown."*

  *Corrected 2026-08-04, measured by the Sovereign instance rather than reasoned: this does **not** reopen a class closed in v0.0.9. What v0.0.9 closed was the duress feature's **runtime** leak, through four live channels. The **at-rest** leak is a distinct object, is tracked under `ATREST-011`, and is open today — their per-persona files are named `*.duress.*`, so the presence of the file discloses that a second persona exists regardless of any encrypted content. An export therefore **adds an instance to an open class**, it does not reopen a closed one. The difference matters: perfecting the archive does not buy what the original phrasing implied.*

  What is genuinely ours is not where the file lives but **what it looks like** — and that turns the transparency requirement above into a problem.

- ⚠️ **The regime declaration lives inside the ciphertext — never in the filename or a plaintext header.** The requirement that the archive declare its own regime was written for honesty. Under the finding above it is **itself an at-rest existence surface**: an archive that describes itself announces itself, and one declaring which persona produced it is the `*.duress.*` filename problem in another form and of our own making. Putting the declaration inside the encrypted payload keeps both properties — whoever can decrypt learns the regime, whoever finds the file learns only that a file is encrypted.

  *Cost, stated rather than discovered:* **no magic header, therefore no format auto-detection.** The reflex design for any file format is a small plaintext header so tools can identify it, and that is exactly what must not exist here; the user points at her archive on import instead of the tool recognising it. Sovereign's *stub-first* importer already absorbs unknown files, so the cost lands near zero on their side.

  *Where there is no ciphertext there is nothing to put it inside, and that is consistent rather than a gap: an archive from a host without encryption no longer carries the stance model or the cursor, so its regime declaration discloses that Spotter was used and little more. **The rule is not "hide the declaration" but "never disclose more than the host can protect"** — which is the same sentence as the contents rule above, applied to metadata.*

  *This is the second time in one day that a transparency requirement collided with a discretion requirement, and both times the way out was the same: **transparency is owed to whoever holds the key, not to whoever holds the disk.***
- **The archive declares the regime under which it was produced** — the mirror's requirement (§4.1) generalised to the file, and the same discipline as Crabe's `SCOPE_NOTICE`: the caveat travels *with* the data rather than in the interface that displayed it.
- **Every entry carries its surface** (§6.4), and **identities are stable**, without which the optional deduplication is not executable.
- Sovereign's importer already exists (`sovereign-import`, v0.0.9) with a *stub-first* doctrine. A **known** Spotter format is a first-class importer there rather than a fallback tier.
- ⚠️ **The dedicated importer sets `is_owned = false`, and inherits nothing from the bulk path's ownership semantics** *(measured in `sovereign-import` by the Sovereign instance, 2026-08-04)*. Everything entering Sovereign by the bulk path lands **`is_owned = true`** — *owned, trusted, control-plane, never injection-fenced* — which is why that path deliberately refuses code and config: importing them would let a file carrying an injection payload be read as the user's own words (Céline's rule: *just docs, no code*). A Spotter archive holds judgments about **pages of the open web**, so entering that way would launder external content into the trust plane, the exact inverse of §6.2 where surfaced entries enter as `is_owned: false`. **This is a larger risk than any import failure**, because it fails silently and in the safe-looking direction.

  *Two corrections to what this document assumed, both measured rather than reasoned:* an **encrypted** archive does **not** escape the bulk funnel by opacity — an unknown extension lands it in the `Stub` tier, so the recommended default is precisely the case that enters. A **plaintext** archive is skipped without a stub, but not silently: it stays in the reviewable `Manifest` counted under `non_document`, visible in the dry-run. So plaintext export must announce that it is not importable by the bulk path and point at the dedicated gesture.

  ⚠️ **An ordering problem this exposes — and the answer makes the dedicated importer the *only* path** *(measured by the Sovereign instance, 2026-08-04)*. Stub-first fixes ownership **at landing**, when the content is by definition unknowable, while a stub is *re-processable later*. **`is_owned` cannot be lowered**: it is set in `Document::new` and no update path touches it, so an archive landed by the bulk path is **permanently mis-owned** and correctable only by deleting and recreating it, which changes its id. *And stub re-processing does not exist either — "increment 2" appears in two comments and no code, so "fidelity improves later" is an intention rather than a mechanism.* The obvious fix, a distinctive extension the funnel would refuse, is not available: it would announce the file at rest (§1.5), and the user names her own file anyway, so any safety resting on the extension is safety she can undo without knowing.

  *The general defect this belongs to is Sovereign's, raised there and carried to Céline: ownership is **inferred from the container** — the folder is the user's, so the content is hers — which is true of the file and false of its contents. What Spotter contributed back is the shape of a third fix their list did not have: **not `true` or `false` but a third state, ownership undetermined pending judgment**, failing closed to external. It is `not_run ≠ zero` applied to a trust flag rather than a score — the fifth appearance of that distinction in the exchange and the first on a boolean — and it **dissolves** the ordering problem rather than patching it, since landing then has nothing to decide and the missing re-processing mechanism stops being load-bearing. The same reasoning is why this funnel never lets a container set a property of its content: the domain a page came from does not fix its quality, and an axis that could not judge is marked, never defaulted.*

## 7. Open decisions (yours to rule)

- **F1 — the stance model** *(resolved v0.6: yes — build it; design in §3.1)*. Modeling held positions is what makes Challenge aim at *your* views rather than generic counter-takes. Privacy-heaviest artifact; handled by §3.1.
- **F2 — discovery timing** *(resolved v0.7)*. Not staged. Retrieval is the product (§0, §5): the standalone extension does real discovery, via existing search engines, with no crawler. Mode A re-ranking survives as a legacy surface rather than the main event.
- **F3 — default aggressiveness** *(resolved 2026-08-10)*. **Aggressive: only what is worth it is surfaced, and the rest is findable but hidden.** Not reorder-only. This is the answer the rest of the design already implied — a finite digest of at most five (§5.5) is suppression by construction, and reorder-only would have contradicted it. What keeps it on the maïeutic side is the second clause, and it is not decoration: *findable* means the **whole** held-back set is recoverable with its reason (§1.1), including the fourth-degree distinction between refused and beaten (§5.2). Hiding is permitted; **hiding without an account of what was hidden is not**.
- **F4 — Sovereign permission level** *(deliberately deferred by Céline, 2026-08-04)*. Action Gravity grades power over *data*; attention-shaping is power over *the user*, which the model has no level for. Does Spotter-in-Sovereign need a new gravity category, or is "Observe + mandatory Plan Visibility" enough? **Held open on purpose, not undecided**: her reason is that recommendation engines optimise to *retain* attention while this one optimises to *concentrate it on what deserves it* — and that second aim carries its own major risk, which is not a question a storage discussion can settle. Nothing is blocked by the wait, because nothing is wired.
- **F5 — re-leveling: proactive or on-demand?** *(resolved 2026-08-10, and neither)* **Both links are present; the user chooses.** The question offered a trade — on-demand is safer but slower, proactive is faster but pushes — and the answer refuses it: showing the original *and* its re-level, with the choice left open, is not pushing. Nothing is substituted and nothing is hidden, which is §5.4's second guard already (*provenance preserved and visible; the original never silently replaced*) taken to its conclusion. *What it costs is the fetch, paid up front for an alternative the reader may not want — affordable only because it happens overnight (§5.5), which is the same reason the editor may run a second retrieval round at all.*
- **F6 — per-axis backend** *(resolved v0.5, §6.1)*. Not local-only-by-policy (that would be protective paternalism — substitution wearing nicer clothes) and not a global cloud switch. Resolution: per-axis, per-provider, **protective by default, explicit revocable opt-in** for cloud judgment of intimate axes; the trade shown via the eval harness; valid only for the user who makes it.
- **F7 — stance-model keys** *(resolved v0.6, §3.1)*. Passphrase-derived encryption; a lost passphrase means re-authoring the stance — acceptable, non-dramatic loss. Nothing on disk decrypts the beliefs without the user.
- **F8 — openness modeling** *(resolved v0.6; **revised 2026-08-04 into a rule per host**, §3.1 / §4)*. Openness is **never a field on a position**, in any host — that shape would put a ledger of vulnerabilities inside the belief model. It is a live challenge cursor (§4), coupled to a strict Crabe gate at high contrarian settings. **What changed is persistence**: not stored in the extension (protected by absence), stored in Sovereign (protected by field-level encryption over per-persona key stores). So the protection changes *nature* rather than disappearing, which is why v0.6's flat "nothing to leak" no longer holds and had to be rewritten rather than extended. Two consequences: the mirror shows under which **regime** each slice was recorded (§4.1), and the challenge score travels with the cursor that produced it (§6.2).
- **F13 — what happens to an item whose gate could not run?** *(resolved 2026-08-04, §5.6)* **Rank on what is available; mark the score's reliability as degraded; list the gates that did not run; and let the editorial pass judge whether the item is worth a slot anyway.**

  This is better than either option the question framed, and for a reason only visible once stated: **whether an unchecked item deserves a slot depends on what else is competing for it.** An unchecked candidate beside four strong verified ones is a different question from the same candidate on a thin day — and no per-item rule can see that, because a per-item rule never sees the slate. The chief editor does. So the arithmetic stays honest and neutral (no invented value, no unjustified demotion), the information travels intact (`degraded` plus the named gates), and the decision lands on the one layer whose whole job is deciding with the whole picture in view.

  It also settles the fail-open argument without adjudicating it: the composition no longer *decides* anything by default. What was an arithmetic accident becomes an editorial judgment — which is exactly the difference between a protection opening in the shade and a choice someone made.

  *Below, as opened. Kept for the path.*

- ~~**F13 — what happens to an item whose gate could not run?**~~ *(the question, 2026-08-04, from the Crabe instance via COORD)* An axis that could not judge is excluded from the arithmetic rather than down-weighted — settled, and right. But **excluding a contribution and excluding a gate are opposite gestures**: dropping a contribution removes a *reason to surface* and lets nothing through, while dropping a gate removes a *protection* and surfaces what could not be examined. *Surfaced is not the same as adjudicated.*

  The current fail-open was justified when Spotter re-ranked a feed, where nothing is hidden and a misplaced item merely sits lower. **The retrieval turn changed that cost without anyone noticing:** in a digest of at most five, surfacing is no longer *showing higher* but *occupying a slot*, displacing something that was examined. The justification went stale in place.

  So the question is Céline's, not a computation rule: **surface it carrying its mark, or hold it until the gate can run?** Between *demoting unjustly* and *protecting less without anyone having decided*, the second failure is the quieter one — and a project whose whole discipline is deciding nothing in the shade cannot let its protection open by arithmetic default. Independent of the ruling: the state must be *visible*, and "the gate did not run" must read differently from "the gate ran and found nothing".
- **F14 — is the Spotter archive writable from inside Sovereign?** *(new, reframed **and resolved** 2026-08-04, §6.5)* **Resolved: the first option — Sovereign builds general export.** Céline's reason is the short one: *she does not want to lock users into Sovereign.* That settles the direction and leaves one caution attached, which governs §6.5: **plaintext export is a major security hole and is to be handled very, very carefully.** The record of how the question was framed follows, because the framing was corrected once on the way. Inside Sovereign, Spotter's data *is* in Sovereign's store, so writing the archive there **is** a partial export of that store, performed by a component Sovereign hosts. The Sovereign node verified its own repository: `sovereign-import` exists (engine + CLI, v0.0.9) with **no symmetric crate or command**, and the only export in the whole workspace is `pdf_export.rs`. So our format would be the ecosystem's only export mechanism.

  **The question is not "two rulings collide" — that framing was mine and it rested on a hardening.** "There is no export from Sovereign outward" was said while explaining why divergent bases are not a problem — nothing flows back, so nothing conflicts. That is a **statement about the current shape**, and it was read here as a **prohibition**. Sovereign's own verification points the same way: there is no export because none was built, not because one was refused. *Céline to confirm which she meant.*

  **What survives the reframing, and it survives under either reading:** the day Spotter-in-Sovereign can write its archive, an exit exists where there was none. That is a decision, not a side effect. Four ways to take it:

  - **Sovereign builds general export** *(the Sovereign node's proposal, and the best of the four)*. The archive stops being an exception and becomes **a projection of a capability that exists** — a specialised format among outputs. The other three trade something; this one costs nothing on either side, and it answers the larger finding: their doctrine asserts abandonability while thirteen crates carry an importer and no exporter. A roadmap decision, theirs to raise and Céline's to rule.
  - **Writable, as an exception** — defensible, but chosen rather than discovered.
  - **Not writable** — then a user moving into Sovereign **loses her backup**. A real regression, to be accepted knowingly.
  - **Not writable, as a host gate** — fails §6.3's own test: the Sovereign host *could* implement it safely, so withholding it would be policy dressed as architecture.
- **F9b — will an unasked-for pool contain challenges worth surfacing?** *(new 2026-08-04, §5.6)* The editorial pass can select contrarian material locally, which removes the egress problem below — the stance model never leaves the machine. What it cannot do is put into the pool something no query went looking for. If topic-derived retrieval returns only material the user already agrees with, a local selector has nothing to choose from. Measurable, and worth measuring before assuming either way.
- **F9 — where do queries come from?** *(new v0.7; base case resolved, §5.3)* **Onboarding seeds both** — it proposes topics, then articles per topic that the user rates, and that one pass yields the query seeds *and* the calibration band for each topic. Watch the §3.1.3 anchoring caution: suggesting topics is not eliciting them, and the suggestion set is a strong prior on where Spotter will ever look. **The hard half, resolved 2026-08-10: a Challenge query comes from the *editor's own round*, and it contradicts a document, never the reader.** §5.6's second funnel builds a contradiction query from a candidate's **claim** — what *that page* asserts — so what leaves the machine is *"strong arguments against carbon pricing reduces emissions efficiently"*. The subject is disclosed; the reader is not.

This dissolves the tension rather than trading against it. The stance model was never the only possible source of a contradiction query — it was the only one anybody had thought of, and it happened to be the one with no local-only form. Contradicting the *haul* needs no model of the user at all, and the guarantee is structural: the query builder is handed subjects and has no parameter through which a stance could arrive (§5.6, `CandidateSubject`).

*Consequence for F9b: the pool is no longer only selected from, it is deliberately argued against. Whether that yields challenges worth surfacing is now measurable rather than hypothetical — and it is measurable on the first real run.*
- **F10 — what is the surface, and at what cadence?** *(resolved v0.7, §5.5)* **A finite daily digest**: retrieval runs overnight, the user reads during the day, and the list holds **at most 5** — a ceiling the user can raise or lower, never a quota to fill. *(Corrected 2026-08-04: this entry read "a default of 5", which the body of §5.5 had already superseded. Céline's own correction — "I said 5 by default, I should have said **at most** 5" — and the difference is the whole design: padding to length with the least-bad remainder teaches the reader that the length means nothing.)* Finite is the point — a digest that ends cannot become a feed, which makes this the first commitment in this document about what Spotter *is* rather than what it filters. Two consequences recorded in §5.5: the latency constraint dissolves, so the fast/slow model split should be re-examined on quality for the retrieval path; and the extension body cannot honestly promise a nightly run (MV3 eviction, a closed laptop), so the trigger degrades through three stated tiers — overnight if the machine is up, else on the first browser interaction of the day, else manual or a small companion cron app, which is a first taste of Sovereign rather than a workaround. Whichever tier ran must be shown; a three-day-old digest presented as today's is the silent staleness this document refuses everywhere else.
- **F12 — how are queries routed across backends?** *(new 2026-08-04; resolved in principle, §5.1)* **Rotate subjects across the generalist engines over time.** Beats a fixed topical map (which gives one provider a standing view of one subject) and round-robin (which gives everyone the same picture at lower resolution): each provider gets a discontinuous slice, which is the hardest of the three to accumulate. Rotation stays *within* the generalist family — families differ in quality per subject, and fragmenting the generalists already buys the privacy. The self-hosted backend remains the floor for anything sensitive.

  **Resolved 2026-08-10: rotation is internal — neither its detail nor a setting for it goes in front of the user.** *Stated carefully so it is not read as an exception to §1.* §1 governs **what is surfaced and why**, which is a filtering decision and must stay inspectable. Choosing which of several equivalent engines serves a subject this week is **routing**: it changes nothing about what reaches the reader or on what grounds. A dial for it would be transparency theatre — a control that looks like agency over the filter while touching only the plumbing — and worse, a setting the user could tune into a *stable* mapping, which is the exact shape rotation exists to prevent. *What is still owed is not a setting but a claim: §5.1's guarantee — no single provider can build your profile from what Spotter sends it — is true only while the rotation actually runs, so it belongs in the manifest as a declared line (§6.3), not in a preferences panel.*

- **F11 — which search backend?** *(kind resolved v0.7; instances resolved 2026-08-10)* **Local only for now; cloud deferred.** The self-hosted generalist (SearXNG, running and verified against a live instance) and the academic source (OpenAlex, no key required) are both available today, which makes the funnel runnable end-to-end without any credential — the "blocked on obtaining credentials" in §5.1 was written before the instance existed. Brave stays **written and not run**, and the two-backends-in-kind decision stands as the shipping shape; what is deferred is which cloud one, not whether. *Deferring it also keeps the first real measurements on the protective path, which is the right way round: a design whose default is self-hosting should be exercised there first rather than validated on the easier substrate and degraded toward the harder one.*
