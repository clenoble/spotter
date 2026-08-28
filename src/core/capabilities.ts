/**
 * What a host carries, assembled from the capabilities it actually passed in.
 *
 * §6.3. Three properties decide the shape, and each came from a specific
 * failure rather than from tidiness:
 *
 * 1. **Assembled, never authored beside.** A manifest written as its own
 *    document would say *guarded* while the wiring passed a bare `fetch`, and
 *    nothing would catch it — the promise this project refuses, in the object
 *    built to state the truth about guarantees. Declaring and wiring have to be
 *    one act, so a capability carries its own declaration and the manifest is
 *    the collection of them.
 * 2. **Per artefact class, not per host.** A host does not have one level of
 *    protection. Sovereign's embedded browser writes to a webview profile that
 *    is neither field-encrypted nor separated by persona, while its store is
 *    both — so "Sovereign host" describes neither accurately.
 * 3. **Each line states the nature of its own backing.** Under a nominal type
 *    system a declaration can become a type only the guarded path can build, so
 *    the line is a consequence of the code compiling. In TypeScript it never
 *    is: any object literal can carry these fields. Aggregating both kinds
 *    without distinguishing them presents as homogeneous something that is not.
 *
 * **The useful thing it does for the code is not display.** It answers whether
 * a class of artefact may be persisted here at all (`mayPersist`) — the rule
 * that keeps the reject window out of an unprotected substrate. The UI reading
 * (`absent`) is the second job, not the first.
 */

/**
 * How much a manifest line is worth.
 *
 * - `proof` — the declaration could not have been written unless the guarded
 *   path produced it. Available under a nominal type system; **not** here.
 * - `declared` — the host asserts it, and a reviewer can check it. Improves the
 *   failure profile (silent omission becomes visible falsehood) without
 *   producing proof.
 */
export type Backing = 'proof' | 'declared';

/**
 * How sensitive a thing is, which decides where it may live.
 *
 * - `tender` — the register of tender points: the stance model, the challenge
 *   cursor, the reject window. §5.2's floor and folding protect these from the
 *   *audit path*; they do nothing against someone reading the file, so an
 *   unprotected substrate must not hold them at all.
 * - `ordinary` — documents, judgments, the offers journal, reading signals.
 *   Sensitive, and not the tender register.
 */
export type ArtefactClass = 'tender' | 'ordinary';

export interface TransportDeclaration {
  readonly capability: 'transport';
  readonly backing: Backing;
  /** Does a fetched body land on disk where this transport runs? */
  readonly responseCacheOnDisk: boolean;
  /**
   * `partial` means literal addresses are classified but a *resolving*
   * hostname is not — no pre-request resolution, no connection pinning.
   * `complete` requires validate, pin and re-check per redirect hop.
   */
  readonly ssrfProtection: 'none' | 'partial' | 'complete';
}

export interface StorageDeclaration {
  readonly capability: 'storage';
  readonly backing: Backing;
  /** Classes this substrate may hold. A class absent here is not persisted. */
  readonly holds: readonly ArtefactClass[];
  readonly encryptedAtRest: boolean;
  readonly separatedByPersona: boolean;
}

export type CapabilityDeclaration = TransportDeclaration | StorageDeclaration;

/**
 * A capability this host does not carry.
 *
 * Naming an absence is **data**, so it costs nothing to ship: the extension can
 * say *"available only in Sovereign"* without carrying a disabled
 * implementation. Inert code would be a re-pointable capability, and on the
 * stored challenge cursor the difference between absent and present-but-off is
 * the difference between a barrier and a promise.
 */
export interface AbsentCapability {
  readonly capability: string;
  /** Shown to the reader. Say what is missing, not that something is missing. */
  readonly label: string;
  /** Where it does exist, so the sentence can name it. */
  readonly availableOn?: string;
}

export interface HostManifest {
  readonly host: string;
  readonly capabilities: readonly CapabilityDeclaration[];
  readonly absent: readonly AbsentCapability[];
}

/**
 * Build the manifest from what was handed in.
 *
 * Deliberately takes the declarations rather than the host's word for them:
 * there is no parameter here for "what this host says it can do". The only way
 * a capability appears is by having been passed.
 */
export function assembleManifest(
  host: string,
  capabilities: readonly CapabilityDeclaration[],
  absent: readonly AbsentCapability[] = []
): HostManifest {
  return { host, capabilities: [...capabilities], absent: [...absent] };
}

/**
 * May this class of artefact be persisted here?
 *
 * **The load-bearing question**, and the reason this module is not decoration.
 * `false` means *do not write it*, not *write it and hope* — a class a host
 * cannot protect is not persisted on that host (§6.3), and the mirror loses
 * precision instead, which is the real cost and the right side of the trade.
 *
 * Absence of a storage declaration is `false`, not `true`: a substrate that did
 * not say what it holds has not said it holds this. Unmeasured must not read as
 * permitted — `not_run ≠ zero`, on a permission.
 */
export function mayPersist(manifest: HostManifest, cls: ArtefactClass): boolean {
  return manifest.capabilities.some(c => c.capability === 'storage' && c.holds.includes(cls));
}

/**
 * Lines that rest on the host's word rather than on a proof.
 *
 * A reader comparing two hosts must be able to tell which *"guarded
 * retrieval"* is a consequence of the compiler and which is an assertion. This
 * returns the second kind so a surface can mark it, rather than leaving the
 * reader to assume the manifest is uniform.
 */
export function declaredOnly(manifest: HostManifest): readonly CapabilityDeclaration[] {
  return manifest.capabilities.filter(c => c.backing === 'declared');
}

/** Does every line rest on the same footing? Used to decide whether to explain. */
export function backingIsUniform(manifest: HostManifest): boolean {
  const kinds = new Set(manifest.capabilities.map(c => c.backing));
  return kinds.size <= 1;
}
