import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorViewOf, type DocumentInput, type SpotterStore } from '../src/core/index';

/**
 * The `SpotterStore` contract, runnable against **any** implementation.
 *
 * §6 says "IndexedDB now, SurrealDB later, behind one interface" — a sentence
 * until the same tests pass against more than one implementation, a property
 * after. The memory store and the IndexedDB store both run this file; a
 * Sovereign binding would too.
 */

const doc = (over: Partial<DocumentInput> = {}): DocumentInput => ({
  id: 'doc_1',
  url: 'https://example.org/a',
  title: 'A',
  topicId: null,
  isOwned: false,
  firstFoundAt: '2026-08-04T00:00:00.000Z',
  publishedAt: null,
  venue: null,
  engine: 'fake',
  deletedAt: null,
  ...over
});

const offer = (over: Partial<Parameters<SpotterStore['recordOffer']>[0]> = {}) => ({
  documentId: 'doc_1',
  topicId: null,
  at: '2026-08-01T00:00:00.000Z',
  surface: 'chrome' as const,
  ...over
});

export function runStoreContract(name: string, makeStore: () => SpotterStore | Promise<SpotterStore>): void {
  const t = (title: string, fn: (s: SpotterStore) => Promise<void>) =>
    test(`[${name}] ${title}`, async () => fn(await makeStore()));

  t('one document round-trips', async s => {
    await s.putDocument(doc());
    assert.equal((await s.getDocument('doc_1'))?.title, 'A');
  });

  t('deletion is soft, and deleted rows stop being readable', async s => {
    await s.putDocument(doc());
    await s.removeDocument('doc_1', '2026-08-04T01:00:00.000Z');
    assert.equal(await s.getDocument('doc_1'), null);
  });

  t('the store hands back copies, not its own rows', async s => {
    await s.putDocument(doc());
    const got = (await s.getDocument('doc_1'))!;
    got.title = 'mutated';
    got.signals.openCount = 99;
    const again = (await s.getDocument('doc_1'))!;
    assert.equal(again.title, 'A');
    assert.equal(again.signals.openCount, 0);
  });

  t('re-writing a document preserves the reader’s history', async s => {
    await s.putDocument(doc());
    await s.recordOpen('doc_1', '2026-08-02T00:00:00.000Z');
    await s.recordRead('doc_1', '2026-08-02T01:00:00.000Z');
    await s.putDocument(doc({ title: 'A, re-scored' }));
    const got = (await s.getDocument('doc_1'))!;
    assert.equal(got.title, 'A, re-scored');
    assert.equal(got.signals.openCount, 1);
    assert.equal(got.signals.readAt, '2026-08-02T01:00:00.000Z');
  });

  t('an offer appends the journal and advances proposedAt in one gesture', async s => {
    await s.putDocument(doc());
    assert.equal((await s.getDocument('doc_1'))?.signals.proposedAt, null, 'found is not offered');
    await s.recordOffer(offer({ at: '2026-08-03T00:00:00.000Z' }));
    await s.recordOffer(offer({ at: '2026-08-01T00:00:00.000Z' }));
    const got = (await s.getDocument('doc_1'))!;
    assert.equal(got.signals.proposedAt, '2026-08-01T00:00:00.000Z', 'earliest offer, not latest');
    assert.equal((await s.offers('0000-01-01T00:00:00.000Z')).length, 2);
  });

  t('repeated offers are separate rows, newest first', async s => {
    await s.putDocument(doc());
    await s.recordOffer(offer({ at: '2026-08-01T00:00:00.000Z' }));
    await s.recordOffer(offer({ at: '2026-08-05T00:00:00.000Z' }));
    const rows = await s.offers('0000-01-01T00:00:00.000Z');
    assert.deepEqual(rows.map(r => r.at), ['2026-08-05T00:00:00.000Z', '2026-08-01T00:00:00.000Z']);
  });

  t('every offer carries the surface that produced it', async s => {
    await s.putDocument(doc());
    await s.recordOffer(offer({ surface: 'sovereign' }));
    assert.equal((await s.offers('0000-01-01T00:00:00.000Z'))[0].surface, 'sovereign');
  });

  t('the journal windows by date, and prunes past its horizon', async s => {
    await s.recordOffer(offer({ documentId: 'old', at: '2025-06-01T00:00:00.000Z' }));
    await s.recordOffer(offer({ documentId: 'new', at: '2026-08-01T00:00:00.000Z' }));
    assert.deepEqual((await s.offers('2026-07-01T00:00:00.000Z')).map(e => e.documentId), ['new']);
    assert.equal(await s.pruneOffers('2026-01-01T00:00:00.000Z'), 1);
    assert.deepEqual((await s.offers('0000-01-01T00:00:00.000Z')).map(e => e.documentId), ['new']);
  });

  t('offered-and-ignored is recoverable across the two objects', async s => {
    await s.putDocument(doc({ id: 'doc_1' }));
    await s.putDocument(doc({ id: 'doc_2', url: 'https://example.org/b' }));
    await s.recordOffer(offer({ documentId: 'doc_1' }));
    await s.recordOffer(offer({ documentId: 'doc_2' }));
    await s.recordRead('doc_2', '2026-08-01T09:00:00.000Z');
    const ignored: string[] = [];
    for (const e of await s.offers('0000-01-01T00:00:00.000Z')) {
      const d = await s.getDocument(e.documentId);
      if (d && d.signals.readAt === null) ignored.push(e.documentId);
    }
    assert.deepEqual(ignored, ['doc_1']);
  });

  t('opening is counted; reading keeps both its first and its last', async s => {
    await s.putDocument(doc());
    await s.recordOpen('doc_1', '2026-08-02T00:00:00.000Z');
    await s.recordOpen('doc_1', '2026-08-03T00:00:00.000Z');
    await s.recordRead('doc_1', '2026-08-03T10:00:00.000Z');
    await s.recordRead('doc_1', '2026-08-09T10:00:00.000Z');
    const sig = (await s.getDocument('doc_1'))!.signals;
    assert.equal(sig.openCount, 2);
    assert.equal(sig.openedAt, '2026-08-02T00:00:00.000Z');
    assert.equal(sig.readAt, '2026-08-03T10:00:00.000Z');
    assert.equal(sig.lastReadAt, '2026-08-09T10:00:00.000Z');
  });

  t('merging another base’s signals is additive through the store', async s => {
    await s.putDocument(doc());
    await s.recordOpen('doc_1', '2026-08-02T00:00:00.000Z');
    await s.mergeDocumentSignals('doc_1', {
      proposedAt: '2026-08-01T00:00:00.000Z',
      openedAt: null,
      openCount: 2,
      readAt: '2026-08-05T00:00:00.000Z',
      lastReadAt: '2026-08-05T00:00:00.000Z'
    });
    const sig = (await s.getDocument('doc_1'))!.signals;
    assert.equal(sig.openCount, 3, 'summed');
    assert.equal(sig.proposedAt, '2026-08-01T00:00:00.000Z');
  });

  t('the editor view answers its three questions and exposes nothing else', async s => {
    await s.putDocument(doc());
    await s.recordOffer(offer({ topicId: 'topic_a', at: '2025-01-01T00:00:00.000Z' }));
    await s.recordOffer(offer({ topicId: 'topic_a', at: '2026-08-01T00:00:00.000Z' }));
    const view = editorViewOf(s);
    assert.deepEqual(Object.keys(view).sort(), ['everProposed', 'lastProposedAt', 'subjectLastSeen']);
    assert.equal(await view.everProposed('doc_1'), true);
    assert.equal(await view.lastProposedAt('doc_1'), '2026-08-01T00:00:00.000Z');
    assert.equal(await view.subjectLastSeen('topic_a'), '2026-08-01T00:00:00.000Z');
    assert.equal(await view.subjectLastSeen('topic_b'), null);
  });

  t('contradicts is a first-class relation', async s => {
    await s.putRelation({
      fromId: 'doc_1',
      toId: 'doc_2',
      type: 'contradicts',
      strength: 0.8,
      createdAt: '2026-08-04T00:00:00.000Z'
    });
    assert.equal((await s.relationsFrom('doc_1'))[0].type, 'contradicts');
  });

  t('a judgment round-trips with judge, policy and cursor', async s => {
    await s.putJudgment({
      documentId: 'doc_1',
      judge: 'spotter',
      score: 42,
      contribution: 60,
      gate: 0.7,
      axes: [{ axis: 'relevance', kind: 'contribution', score: 60, reason: 'r', ok: true }],
      degraded: false,
      model: 'mistral',
      policy: 'weights:rel=1',
      cursor: null,
      assessedAt: '2026-08-04T00:00:00.000Z'
    });
    const j = (await s.getJudgment('doc_1'))!;
    assert.equal(j.judge, 'spotter');
    assert.equal(j.policy, 'weights:rel=1');
    assert.equal(j.cursor, null);
  });
}
