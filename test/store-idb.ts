import 'fake-indexeddb/auto';
import { runStoreContract } from './store-contract';
import { createIdbStore } from '../src/lib/store/spotter-db';

/**
 * The IndexedDB implementation, held to the same contract as the memory store.
 *
 * `fake-indexeddb` supplies the ambient `indexedDB` under Node — which is the
 * one capability this host module is allowed to reach for, being a host
 * module. Each test gets a fresh database name: shared state between contract
 * tests would make them order-dependent, which is a flakiness generator with
 * no compensating virtue.
 */
let n = 0;
runStoreContract('idb', () => createIdbStore(`spotter-test-${n++}`));
