# Decisions taken without you — 2026-08-03, overnight

*Written for review. Each entry: what I chose, why, and what would reverse it. Nothing here is settled by my having done it — if any of these is wrong, the cost of undoing it is noted.*

---

## 1. Research before implementation

**Chose:** verified the search substrate before writing any retrieval code, rather than building the adapter and discovering the APIs later.

**Why:** the spec says so in as many words (F11, *"to be settled by verification rather than preference"*), and the shape of §5.2's triage depends entirely on what metadata the providers actually return. Brave gives `page_age` and a `freshness` filter; Marginalia gives no date at all. An adapter designed against imagined responses would have had to be rebuilt.

**Reverses if:** you'd rather have had a running prototype against one guessed backend tonight, accepting rework.

---

## 2. Stopped chasing Brave's terms after five dead URLs — and designed so the question doesn't matter

**Chose:** the funnel stores **only the URL, the title, and our own axis vector**. Provider snippets are triage input and are dropped. There is now a test asserting no provider prose survives into a digest entry.

**Why:** Brave's documentation says storing results in whole or part needs a plan granting storage rights. I could not verify it — the API agreement lives behind the developer dashboard, and five public URLs 404'd or were silent. Rather than let a clause I cannot read decide the architecture, I built so it never applies.

It also lands somewhere better than the legal answer would have. Retaining a provider's snippets is the same act as storing raw post text, which this project already refuses; the reason shown to the user is *our* axis vector anyway (§1.2), not somebody else's description.

**Cost, stated plainly:** the digest cannot show a snippet it never kept. It shows title, link, and our reasons — or re-fetches at read time for a preview. I assumed the first.

**Reverses if:** you read the actual agreement and storage is fine, *and* you want provider snippets in the digest. Cheap to undo — one field, one test.

---

## 3. Shipped the rewritten Pollution prompt despite a regression, and left the regression unfixed

**Chose:** the new prompt is the default. The middle-band overshoot it introduced is documented and **not** iterated on.

**Why ship it:** the old prompt let actual pollution through entirely — machine-written filler scored 0 on every local model, which is a gate that isn't working. All three local models moved a long way (MAE roughly halved, bucket agreement up 20–30 points), and the gain is spread across all four pollution items rather than concentrated on the one failure I already knew about — which is the main argument that I didn't simply fit the prompt to its test.

**Why not fix the regression:** an item with real content behind an engagement hook swung from far too clean (0) to far too polluted (80) against a label of 45. That is the dangerous direction for a gate — it demotes genuine material. I could have tuned it out in twenty minutes. **Iterating a prompt against ten synthetic items until the numbers look right is exactly how a test becomes a target**, and the corpus is written by the same kind of hand as the prompt. The honest fix needs your genre-spanning corpus (§3.2).

**Reverses if:** you'd rather have the old prompt back while the corpus is built. `git revert` on that commit; the measurements are in the message.

**Caveat I want on the record:** I had seen the old failures before writing the new prompt. So this measurement is *consistent with* a better prompt and is not evidence of one.

---

## 4. Both search adapters are written, neither is verified

**Chose:** implement SearXNG and Brave from documentation, fixture-test the parsing and guards, and **say in the tests** that neither has met its real provider.

**Why:** verification needs a Brave key and a running SearXNG instance, neither of which I have. Writing plausible network code and letting it look finished is the failure mode I'd rather name than commit.

**What is genuinely verified:** parsing, parameter mapping, the URL guard, the tracking-parameter stripping, error messages. **What is not:** that either provider behaves as its docs claim.

---

## 5. Triage is rules only — no scoring, ever

**Chose:** the metadata triage step drops what cannot be surfaced (unresolvable URL, duplicate, no title) or exceeds the fetch budget. It never judges worth.

**Why:** a cheap scorer hidden in triage would be an opaque filter doing its damage *before* the inspectable axes ever ran — the exact shape this project exists to refuse. Judging happens after a fetch, on the axes, where the reasoning survives to the screen. The budget is reported like every other rule: a silent cap reads as "we looked at everything", which would be a lie.

---

## 6. Pushed the branch; did **not** advance `main`

**Chose:** `wip/pollution-wiring` is pushed to the NAS; `main` still points where it did.

**Why:** the branch is linear on top of `main`, so fast-forwarding is one command whenever you want it. Doing it while you sleep would make a night's autonomous work the project's trunk without you having read any of it.

---

## 7. Small ones, grouped

- **Node's built-in test runner**, not vitest — no new dependency, and `tsx --test` already worked.
- **Mutation-tested the invariants harness** rather than trusting 18/18 on the first run: removing the gate clamp turns 2 red, mis-normalising contribution turns 6 red. A harness that has never failed has not been shown to work.
- **Pollution's default model** moved `qwen2.5:3b` → `mistral`, matching your backend decision.
- **`looksResolvable` is a denylist**, so it catches the redirectors we know about and is not a guarantee. The durable protection is choosing substrates that return direct URLs at all.
- **`Platform` gained `'web'`** — since v0.7 a document at a URL is the ordinary case.
- **Ties in the digest break on URL**, so a run is reproducible instead of inheriting whatever order the provider returned.

---

## Still owed, and deliberately not started

- **The stance-model query** (F9's hard half) — it carries the egress tension, and it is not mine to resolve.
- **The delivery surface** (F10) — the digest store, the trigger tiers, "which tier ran". Buildable, but it would be UI with nothing behind it until a real backend is chosen.
- **Wiring retrieval into the extension** — blocked on picking one backend of each kind and getting credentials.
- **The middle band of the Pollution axis** — see 3.
