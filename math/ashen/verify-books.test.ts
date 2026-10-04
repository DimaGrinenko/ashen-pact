import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';
import { CANDIDATE_MODES, completeRound, summarizeBook } from './candidates';
import { MODE_COST } from './config';
import { verifyPackage } from './verify-books';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nativeZstd = typeof zlib.zstdCompressSync === 'function' && typeof zlib.createZstdDecompress === 'function';
async function fixture(t: TestContext, change: 'csv-payout' | 'event-index' | 'policy' | 'corrupt-zstd' | 'mode-cost') {
  const work = path.join(project, 'work'); await mkdir(work, { recursive: true });
  const directory = await mkdtemp(path.join(work, 'ashen-book-verifier-test-'));
  const owned = ['index.json', 'books_base.jsonl.zst', 'lookUpTable_base_0.csv', 'seeds_base.jsonl'];
  t.after(async () => { for (const name of owned) await unlink(path.join(directory, name)); await rmdir(directory); });
  const book = completeRound('base', 670096, 0, 'decline-all'), seed = summarizeBook(book, 'base');
  if (change === 'event-index') book.events[1].index = 9;
  if (change === 'policy') { assert(book.events[0].type === 'ashenBook'); book.events[0].math.policyId = 'accept-all'; }
  const compressed = zlib.zstdCompressSync(Buffer.from(JSON.stringify(book) + '\n'));
  await writeFile(path.join(directory, owned[1]), change === 'corrupt-zstd' ? Buffer.from('not a zstandard stream') : compressed);
  await writeFile(path.join(directory, owned[2]), `0,1000000000000000,${book.payoutMultiplier + (change === 'csv-payout' ? 20 : 0)}\n`);
  await writeFile(path.join(directory, owned[3]), JSON.stringify(seed) + '\n');
  await writeFile(path.join(directory, owned[0]), JSON.stringify({ modes: CANDIDATE_MODES.map(name => ({ name, cost: MODE_COST[name] + (change === 'mode-cost' && name === 'base' ? 1 : 0), events: `books_${name}.jsonl.zst`, weights: `lookUpTable_${name}_0.csv` })) }));
  return directory;
}
test('streaming verifier rejects lookup/event payout mismatch', { skip: !nativeZstd }, async t => {
  await assert.rejects(verifyPackage(await fixture(t, 'csv-payout'), { allowUnmanifestedStaging: true }), /payout mismatch/);
});
test('streaming verifier rejects missing/noncontiguous event indices', { skip: !nativeZstd }, async t => {
  await assert.rejects(verifyPackage(await fixture(t, 'event-index'), { allowUnmanifestedStaging: true }), /indices/);
});
test('streaming verifier binds recorded policy to the immutable seed ledger', { skip: !nativeZstd }, async t => {
  await assert.rejects(verifyPackage(await fixture(t, 'policy'), { allowUnmanifestedStaging: true }), /policy|metadata mismatch/);
});
test('invalid Zstandard is rejected rather than accepted as renamed JSONL', { skip: !nativeZstd }, async t => {
  await assert.rejects(verifyPackage(await fixture(t, 'corrupt-zstd'), { allowUnmanifestedStaging: true }));
});
test('mode-cost corruption is rejected before weighting or playback', { skip: !nativeZstd }, async t => {
  await assert.rejects(verifyPackage(await fixture(t, 'mode-cost'), { allowUnmanifestedStaging: true }), /mode price/);
});
