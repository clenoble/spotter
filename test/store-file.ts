import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStoreContract } from './store-contract';
import { createFileStore } from '../companion/store-file';

/**
 * The companion's file store, held to the same contract as memory and
 * IndexedDB. Three implementations, one suite — and the fourth, the
 * `sovereign-db` binding, will run this same file when it exists. That is
 * what makes "behind one interface" a property rather than a sentence, and
 * what makes the later move into Sovereign a mapping rather than a redesign.
 */
const dir = mkdtempSync(join(tmpdir(), 'spotter-file-store-'));
let n = 0;
runStoreContract('file', () => createFileStore(join(dir, `store-${n++}.json`)));
