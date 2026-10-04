import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import * as zlib from 'node:zlib';
import { assertEngineContract, completeRound, summarizeBook, validateEventBook, CANDIDATE_MODES, MAX_PAYOUT } from './candidates';
import type { EventBook } from './candidates';
import type { Candidate, StatisticsVerification, WeightedOutcome, WeightedStatistics } from './contracts';
import { MAX_BASE_BET_TEMPLATE, MIN_BASE_BET_TEMPLATE, MIN_RELEASE_BOOKS_PER_MODE, MODE_COST, WEIGHT_TOTAL } from './config';
import { calculateStatistics } from './statistics';
import { verifyStatistics } from './verify-statistics';
import { auditBetLevels } from './registration';
import type { RegistrationAudit } from './registration';
import { API_SCALE } from '../../src/ashen/rgs';

export interface IndexMode { name: typeof CANDIDATE_MODES[number]; cost: number; events: string; weights: string }
export interface BookIndex { modes: IndexMode[] }
export interface VerifiedMode {
  mode: typeof CANDIDATE_MODES[number]; books: number; parsedEvents: number; replayedBooks: number;
  wholeRoundLedgerVerified: true; contiguousEventIndicesVerified: true; recordedPoliciesVerified: true;
  statistics: WeightedStatistics; verification: StatisticsVerification;
  /** Assumed template endpoints and 1 unit, not authenticated server levels. */
  templateWalletScaling: RegistrationAudit;
}
export interface PackageVerification {
  pass: true; generatedAt: string; modes: VerifiedMode[]; compression: 'zstandard';
  platformImportValidated: false; productionApproved: false;
}
export interface VerifyOptions { requireRelease?: boolean; replaySamplesPerMode?: number; allowUnmanifestedStaging?: boolean }

export function requireZstandard(): void {
  assert(typeof zlib.createZstdCompress === 'function' && typeof zlib.createZstdDecompress === 'function',
    'Actual streaming Zstandard is required. Use a Node runtime exposing createZstdCompress/createZstdDecompress (Node 22.15+ or 24+); JSONL must never be renamed to .zst.');
}
export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer); return hash.digest('hex');
}
export async function sourceFingerprints(project: string): Promise<Record<string, string>> {
  const dir = path.join(project, 'math/ashen');
  const files = ['src/ashen/engine.ts', 'src/ashen/rgs.ts', ...(await readdir(dir)).filter(name => name.endsWith('.ts')).map(name => `math/ashen/${name}`)].sort();
  return Object.fromEntries(await Promise.all(files.map(async file => [file, await sha256File(path.join(project, file))])));
}
async function localFile(directory: string, name: string): Promise<string> {
  assert(name === path.basename(name) && !name.includes('..') && !name.includes('/') && !name.includes('\\'), `Invalid package filename: ${name}`);
  const file = path.join(directory, name), stat = await lstat(file); assert(stat.isFile() && !stat.isSymbolicLink(), `Package entry must be a regular file: ${name}`); return file;
}
function integerString(value: string, label: string): bigint {
  assert(/^(0|[1-9]\d*)$/.test(value), `Invalid ${label}`); return BigInt(value);
}
/** Stream errors propagate through the async iterator, including corrupt Zstd. */
async function* lines(input: Readable): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8'); let pending = '';
  for await (const chunk of input) {
    pending += decoder.write(chunk as Buffer);
    let newline: number;
    while ((newline = pending.indexOf('\n')) !== -1) {
      assert(newline < 1_000_000, 'Input line exceeds maximum book size');
      const line = pending.slice(0, newline); pending = pending.slice(newline + 1); yield line.endsWith('\r') ? line.slice(0, -1) : line;
    }
    assert(pending.length < 1_000_000, 'Input line exceeds maximum book size');
  }
  pending += decoder.end(); if (pending) yield pending;
}
async function verifyManifestIfPresent(directory: string, allowAbsent: boolean): Promise<void> {
  const file = path.join(directory, 'manifest.json');
  let raw: string;
  try { raw = await readFile(file, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && allowAbsent) return;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Published package is missing its complete SHA-256 manifest');
    throw error;
  }
  const manifest = JSON.parse(raw) as { files: { name: string; bytes: number; sha256: string }[] };
  const required = ['index.json', 'generation.json', 'verification.json', ...CANDIDATE_MODES.flatMap(mode => [`books_${mode}.jsonl.zst`, `lookUpTable_${mode}_0.csv`, `seeds_${mode}.jsonl`])].sort();
  assert(Array.isArray(manifest.files), 'Incomplete manifest');
  assert.deepEqual(manifest.files.map(entry => entry.name).sort(), required, 'Manifest must cover every mathematical input and verification file exactly once');
  const seen = new Set<string>();
  for (const entry of manifest.files) {
    assert(!seen.has(entry.name), 'Duplicate manifest filename'); seen.add(entry.name);
    const target = await localFile(directory, entry.name); assert.equal((await lstat(target)).size, entry.bytes, `${entry.name}: byte size mismatch`);
    assert.equal(await sha256File(target), entry.sha256, `${entry.name}: SHA-256 mismatch`);
  }
}

/** Parses every decompressed book and CSV row. Memory holds compact payout rows,
 * never the millions of full event frames. Selected seeds are regenerated using
 * the actual engine; caps and every recorded policy are always replayed. */
export async function verifyPackage(directory: string, options: VerifyOptions = {}): Promise<PackageVerification> {
  requireZstandard(); assertEngineContract(); await verifyManifestIfPresent(directory, options.allowUnmanifestedStaging === true);
  const index = JSON.parse(await readFile(await localFile(directory, 'index.json'), 'utf8')) as BookIndex;
  assert.deepEqual(index.modes.map(mode => mode.name), CANDIDATE_MODES, 'Package must contain all six modes exactly once, in canonical order');
  const modes: VerifiedMode[] = [];
  for (const mode of index.modes) {
    assert.equal(mode.cost, MODE_COST[mode.name], `${mode.name}: incorrect mode price`);
    assert.equal(mode.events, `books_${mode.name}.jsonl.zst`); assert.equal(mode.weights, `lookUpTable_${mode.name}_0.csv`);
    const eventPath = await localFile(directory, mode.events), csvPath = await localFile(directory, mode.weights), seedPath = await localFile(directory, `seeds_${mode.name}.jsonl`);
    const input = createReadStream(eventPath), decoder = zlib.createZstdDecompress();
    input.on('error', error => decoder.destroy(error)); input.pipe(decoder);
    const csv = createReadStream(csvPath), seeds = createReadStream(seedPath);
    csv.on('error', error => decoder.destroy(error)); seeds.on('error', error => decoder.destroy(error));
    const csvIterator = lines(csv), seedIterator = lines(seeds);
    const rows: WeightedOutcome[] = [], replayed = new Set<number>(), policies = new Set<string>(), seenSeeds = new Set<number>();
    let parsedEvents = 0, previousCandidate: Candidate | undefined, previousBook: EventBook | undefined;
    // A fixed stride permits a streaming deterministic sample without knowing
    // the final book count. At least 200 of the minimum release pool are checked.
    const samples = options.replaySamplesPerMode ?? 256;
    assert(Number.isSafeInteger(samples) && samples >= 1 && samples <= 10_000, 'Replay sample count must be 1..10000');
    const stride = Math.max(1, Math.floor(MIN_RELEASE_BOOKS_PER_MODE / samples));
    try {
      for await (const line of lines(decoder)) {
        assert(rows.length < 1_000_001, 'Package exceeds the bounded candidate pool');
        assert(line.length > 0 && line.length < 1_000_000, 'Empty or unexpectedly large event book');
        const book = JSON.parse(line) as EventBook, csvRow = await csvIterator.next(), seedRow = await seedIterator.next();
        assert(!csvRow.done && !seedRow.done, `${mode.name}: truncated lookup or seed ledger`);
        const columns = csvRow.value.split(','); assert.equal(columns.length, 3, 'Lookup must be headerless id,weight,payout');
        const id = Number(integerString(columns[0], 'lookup id')), weight = integerString(columns[1], 'lookup weight'), payout = Number(integerString(columns[2], 'lookup payout'));
        assert.equal(id, rows.length, 'Non-contiguous lookup IDs'); assert.equal(book.id, id, 'Book/lookup ID mismatch');
        assert(weight > 0n && weight <= WEIGHT_TOTAL, 'Lookup weights must be positive and bounded');
        assert(Number.isSafeInteger(payout) && payout <= MAX_PAYOUT, 'Invalid lookup payout'); assert.equal(book.payoutMultiplier, payout, 'Book/lookup payout mismatch');
        validateEventBook(book, mode.name);
        const candidate = JSON.parse(seedRow.value) as Candidate; assert.deepEqual(candidate, summarizeBook(book, mode.name), 'Seed ledger/event metadata mismatch');
        assert(!seenSeeds.has(candidate.seed), 'Repeated round seed within a mode could conceal duplicate-book concentration'); seenSeeds.add(candidate.seed);
        const replay = id % stride === 0 || candidate.capped || !policies.has(candidate.policyId);
        if (replay) { assert.deepEqual(completeRound(mode.name, candidate.seed, id, candidate.policyId), book, `${mode.name}/${id}: seed replay differs`); replayed.add(id); }
        policies.add(candidate.policyId); parsedEvents += book.events.length;
        rows.push({ id, payoutMultiplier: payout, weight: weight.toString() }); previousCandidate = candidate; previousBook = book;
      }
      assert((await csvIterator.next()).done && (await seedIterator.next()).done, 'Lookup or seed ledger has extra rows');
    } finally { csv.destroy(); seeds.destroy(); input.destroy(); decoder.destroy(); }
    assert(rows.length > 0, `${mode.name}: empty books`);
    if (previousCandidate && previousBook && !replayed.has(previousCandidate.id)) {
      assert.deepEqual(completeRound(mode.name, previousCandidate.seed, previousCandidate.id, previousCandidate.policyId), previousBook, 'Last-row seed replay differs'); replayed.add(previousCandidate.id);
    }
    assert.equal(policies.size, 4, 'All four precommitted pact policies must have support');
    if (options.requireRelease !== false) assert(rows.length >= MIN_RELEASE_BOOKS_PER_MODE, `${mode.name}: below release pool minimum`);
    const statistics = calculateStatistics(mode.name, rows), verification = verifyStatistics(mode.name, statistics, { requireReleaseSize: options.requireRelease !== false });
    assert.equal(statistics.exact.totalWeight, WEIGHT_TOTAL.toString(), `${mode.name}: total weight differs from reserved integer mass`);
    assert(verification.passed, `${mode.name}: weighted mathematics failed: ${verification.failures.join('; ')}`);
    const templateWalletScaling = auditBetLevels(mode.name, rows, [MIN_BASE_BET_TEMPLATE * API_SCALE, API_SCALE, MAX_BASE_BET_TEMPLATE * API_SCALE]);
    assert(templateWalletScaling.allLevelsMatch96Percent, `${mode.name}: template wallet rounding changed the exact target RTP`);
    modes.push({ mode: mode.name, books: rows.length, parsedEvents, replayedBooks: replayed.size, wholeRoundLedgerVerified: true, contiguousEventIndicesVerified: true, recordedPoliciesVerified: true, statistics, verification, templateWalletScaling });
  }
  return { pass: true, generatedAt: new Date().toISOString(), modes, compression: 'zstandard', platformImportValidated: false, productionApproved: false };
}
