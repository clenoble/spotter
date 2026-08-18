/**
 * User models live in the core (spec §6: "value engine, five-axis scorers,
 * **user models**, composition policy"). The preference doc was previously in
 * `shared/`, which also holds `RawPost` — and `RawPost` carries a DOM `Element`.
 * Core reaching into `shared/` therefore pointed the dependency at the DOM,
 * against the rule stated in `core/index.ts`. It now points the other way:
 * hosts depend on core, never the reverse.
 *
 * The stance model, frontier and expertise map (spec §3) land beside this file
 * as they arrive.
 */
export interface PreferenceDoc {
  version: number;
  topicsMore: string[];
  topicsLess: string[];
  tonePreferences: string[];
  authorsBoost: string[];
  authorsMute: string[];
  explorationRate: number;
  explorationMode: 'new-topics' | 'alternate-viewpoints' | 'mixed';
  customRules: string[];
  /**
   * Good and bad examples, submitted by the user — the v0.1 onboarding shape
   * (Céline, 2026-08-10: "liste de sujets + des liens que l'utilisateur peut
   * soumettre comme bons et mauvais exemples (optionnel)").
   *
   * They feed two axes at once: **Quality** reads them as taste exemplars
   * (what this reader finds substantive vs hollow), **Calibration** as an
   * altitude band (the level of what they like). Optional by design — with no
   * examples, Quality falls back to a generic bar and Calibration is not run
   * at all, since a band nobody declared is not a band.
   */
  examples?: ExampleLink[];
  /**
   * Mode B — declared sources, read through their feeds (§5). Preference
   * material, not backend configuration: which sources a reader trusts is a
   * statement about their reading, and it travels with the preference doc.
   */
  feeds?: { url: string; name: string }[];
  updatedAt: string;
}

/**
 * One example link. `title` and `excerpt` are captured **at submission time**
 * by the host (one fetch, once): a URL alone teaches a prompt nothing, and
 * re-fetching examples at every scoring run would multiply egress for no new
 * information.
 */
export interface ExampleLink {
  url: string;
  verdict: 'good' | 'bad';
  /** The user's own words about why, when they gave any. */
  note?: string;
  title?: string;
  /** First ~500 chars of extracted text, captured once at submission. */
  excerpt?: string;
}
