import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, documentIdFor, cleanUrl, mergeSignals, emptySignals } from '../src/core/index';
import { runStoreContract } from './store-contract';

/**
 * The memory store, held to the shared contract — plus the pure functions
 * that belong to no implementation.
 *
 * The behavioural tests used to live here directly; they moved to
 * `store-contract.ts` when the IndexedDB store arrived, so that "behind one
 * interface" (§6) is a property both implementations are checked against
 * rather than a sentence about one of them.
 */
runStoreContract('memory', createMemoryStore);

test('merging signals is additive per field, not per record', () => {
  // §6.4. "Additive" declines differently for each field, and getting one
  // wrong is silent — so the rules are asserted rather than trusted.
  const a = {
    proposedAt: '2026-08-01T00:00:00.000Z',
    openedAt: '2026-08-02T00:00:00.000Z',
    openCount: 2,
    readAt: '2026-08-03T00:00:00.000Z',
    lastReadAt: '2026-08-03T00:00:00.000Z'
  };
  const b = {
    proposedAt: '2026-08-05T00:00:00.000Z',
    openedAt: null,
    openCount: 1,
    readAt: null,
    lastReadAt: '2026-08-09T00:00:00.000Z'
  };
  const m = mergeSignals(a, b);
  assert.equal(m.proposedAt, '2026-08-01T00:00:00.000Z', 'earliest');
  assert.equal(m.openedAt, '2026-08-02T00:00:00.000Z', 'earliest, and null is not a date');
  assert.equal(m.openCount, 3, 'summed');
  assert.equal(m.readAt, '2026-08-03T00:00:00.000Z', 'earliest');
  assert.equal(m.lastReadAt, '2026-08-09T00:00:00.000Z', 'latest');
});

test('merging is commutative, or two devices disagree on the same pair', () => {
  const a = {
    proposedAt: '2026-08-01T00:00:00.000Z',
    openedAt: null,
    openCount: 2,
    readAt: '2026-08-03T00:00:00.000Z',
    lastReadAt: '2026-08-03T00:00:00.000Z'
  };
  const b = {
    proposedAt: '2026-08-05T00:00:00.000Z',
    openedAt: '2026-08-06T00:00:00.000Z',
    openCount: 1,
    readAt: null,
    lastReadAt: '2026-08-09T00:00:00.000Z'
  };
  assert.deepEqual(mergeSignals(a, b), mergeSignals(b, a));
});

test('merging an empty set changes nothing', () => {
  const a = {
    proposedAt: '2026-08-01T00:00:00.000Z',
    openedAt: '2026-08-02T00:00:00.000Z',
    openCount: 2,
    readAt: null,
    lastReadAt: null
  };
  assert.deepEqual(mergeSignals(a, emptySignals()), a);
});

test('tracking variants of one link share one identity', () => {
  // Otherwise §5.6 would offer the same article twice and call it new — and
  // §6.4's deduplication across a user's installs keys on exactly this.
  const a = documentIdFor(cleanUrl('https://example.org/p?utm_source=x'));
  const b = documentIdFor(cleanUrl('https://example.org/p?mc_cid=y'));
  const c = documentIdFor(cleanUrl('https://example.org/p'));
  assert.equal(a, b);
  assert.equal(b, c);
});

test('different documents get different identities', () => {
  assert.notEqual(documentIdFor('https://example.org/a'), documentIdFor('https://example.org/b'));
  assert.notEqual(documentIdFor('https://a.example/p'), documentIdFor('https://b.example/p'));
});
