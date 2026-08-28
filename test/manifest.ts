import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleManifest,
  mayPersist,
  declaredOnly,
  backingIsUniform,
  type CapabilityDeclaration
} from '../src/core/index';

/**
 * Correctness invariants for the capability manifest (§6.3).
 *
 * The manifest's job is not display: it answers whether a class of artefact may
 * be persisted on this host. These assert that question is answered the safe
 * way round, and that the manifest cannot say more than it was given.
 */

const browserTransport: CapabilityDeclaration = {
  capability: 'transport',
  backing: 'declared',
  responseCacheOnDisk: false,
  ssrfProtection: 'partial'
};

const browserStore: CapabilityDeclaration = {
  capability: 'storage',
  backing: 'declared',
  holds: ['ordinary'],
  encryptedAtRest: false,
  separatedByPersona: false
};

const sovereignStore: CapabilityDeclaration = {
  capability: 'storage',
  backing: 'declared',
  holds: ['ordinary', 'tender'],
  encryptedAtRest: true,
  separatedByPersona: true
};

test('the manifest holds exactly what was passed, and nothing else', () => {
  // Assembled, never authored beside. There is no parameter for "what the host
  // says it can do" — the only way a capability appears is by having been
  // handed in, so declaring and wiring are one act.
  const m = assembleManifest('browser', [browserTransport]);
  assert.deepEqual(m.capabilities, [browserTransport]);
  assert.equal(m.capabilities.length, 1, 'nothing appears that was not given');
});

test('a host without encryption may not persist the tender class', () => {
  // The rule that keeps the reject window, the stance model and the cursor out
  // of a substrate that cannot protect them. §5.2's floor and folding guard the
  // audit path; they do nothing against someone reading the file.
  const browser = assembleManifest('browser', [browserTransport, browserStore]);
  assert.equal(mayPersist(browser, 'ordinary'), true);
  assert.equal(mayPersist(browser, 'tender'), false, 'the mirror loses precision instead');
});

test('a host with a protected substrate may persist both', () => {
  const sovereign = assembleManifest('sovereign', [sovereignStore]);
  assert.equal(mayPersist(sovereign, 'ordinary'), true);
  assert.equal(mayPersist(sovereign, 'tender'), true);
});

test('no storage declaration means no permission, never a default yes', () => {
  // `not_run ≠ zero`, applied to a permission: a substrate that did not say
  // what it holds has not said it holds this. The safe direction is the one
  // that refuses, because the unsafe direction fails silently and looks fine.
  const m = assembleManifest('unknown', [browserTransport]);
  assert.equal(mayPersist(m, 'ordinary'), false);
  assert.equal(mayPersist(m, 'tender'), false);
});

test('an absent capability is named without being carried', () => {
  // Naming an absence is data. Inert code would be a re-pointable capability,
  // and on the stored cursor the difference between absent and present-but-off
  // is the difference between a barrier and a promise.
  const m = assembleManifest('browser', [browserTransport, browserStore], [
    { capability: 'guardian-recovery', label: 'Recovery through guardians', availableOn: 'Sovereign' }
  ]);
  assert.equal(m.absent[0].availableOn, 'Sovereign', 'the sentence can name where it exists');
  assert.equal(m.capabilities.length, 2, 'naming a capability must not add it');

  // The stronger assertion — that no *present* capability is named
  // `guardian-recovery` — was written here and the compiler refused it as
  // vacuous: `CapabilityDeclaration` is a closed union, so an absent name
  // cannot be a present one. The guarantee lives in the type rather than in
  // this file, which is the better place for it. Left as a note because a
  // deleted test looks like a test nobody thought of.
});

test('lines resting on the host’s word are separable from lines resting on a proof', () => {
  // A reader comparing two hosts must be able to tell which "guarded retrieval"
  // is a consequence of the compiler and which is an assertion.
  const mixed = assembleManifest('sovereign', [
    { ...browserTransport, backing: 'proof' },
    sovereignStore
  ]);
  assert.deepEqual(declaredOnly(mixed), [sovereignStore]);
  assert.equal(backingIsUniform(mixed), false, 'mixed footing must be explained, not averaged');
});

test('a uniform manifest says so, so a surface need not explain what is not mixed', () => {
  const m = assembleManifest('browser', [browserTransport, browserStore]);
  assert.equal(backingIsUniform(m), true);
  assert.deepEqual(declaredOnly(m), [browserTransport, browserStore]);
});

test('the manifest is a copy, so a caller cannot edit a host’s claims afterwards', () => {
  const given: CapabilityDeclaration[] = [browserTransport];
  const m = assembleManifest('browser', given);
  given.push(sovereignStore);
  assert.equal(m.capabilities.length, 1, 'a manifest that can be appended to is not a record');
});
