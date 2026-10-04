import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';
import { assertEngineContract, CANDIDATE_MODES, completeRound, GENERATOR, summarizeBook } from './candidates';
import type { CandidatePool } from './candidates';
import type { Candidate, OptimizationResult } from './contracts';
import { MAX_BASE_BET_TEMPLATE, MIN_BASE_BET_TEMPLATE, MIN_RELEASE_BOOKS_PER_MODE, MODE_COST, WEIGHT_TOTAL } from './config';
import { BASE_BET_QUANTUM_MICRO } from './registration';
import { requireZstandard, sha256File, sourceFingerprints, verifyPackage } from './verify-books';
import type { BookIndex, PackageVerification } from './verify-books';

export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export interface PreparedMode { pool: CandidatePool; optimized: OptimizationResult }
export interface ExportOptions { out: string; sources: Record<string, string>; masterSeed: number }
export interface ExportResult { directory: string; verification: PackageVerification; status: 'verified-local-math-not-platform-approved' }
export function replayCandidate(candidate: Candidate) {
  const book = completeRound(candidate.mode, candidate.seed, candidate.id, candidate.policyId);
  assert.deepEqual(summarizeBook(book, candidate.mode), candidate, `${candidate.mode}/${candidate.id}: candidate replay changed before export`);
  return book;
}
function isInside(parent: string, target: string): boolean {
  const relative = path.relative(parent, target); return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
/** Publication within work/ is atomic. Existing outputs are never replaced.
 * Desktop copies/deployment are a separate, explicit artifact operation. */
async function stageOutput(requested: string): Promise<{ target: string; stage: string }> {
  const project = await realpath(PROJECT), work = path.join(project, 'work'), target = path.resolve(project, requested);
  assert(isInside(work, target), '--out must be a new directory inside this project’s work/ subtree');
  if (await exists(work)) assert(!(await lstat(work)).isSymbolicLink(), 'work/ may not be a symlink'); else await mkdir(work);
  let current = work;
  for (const component of path.relative(work, path.dirname(target)).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (await exists(current)) { const stat = await lstat(current); assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Output ancestors must be normal directories'); }
    else await mkdir(current);
  }
  assert(isInside(await realpath(project), await realpath(path.dirname(target))), 'Resolved output parent escaped the project');
  assert(!(await exists(target)), 'Output already exists; choose a new output directory to preserve earlier books');
  const stage = `${target}.staging-${process.pid}-${Date.now()}`; await mkdir(stage);
  return { target, stage };
}

export async function exportBooks(modes: readonly PreparedMode[], options: ExportOptions): Promise<ExportResult> {
  requireZstandard(); assertEngineContract(); assert.deepEqual(modes.map(mode => mode.pool.mode), CANDIDATE_MODES, 'All six modes must be prepared in canonical order');
  assert.deepEqual(await sourceFingerprints(PROJECT), options.sources, 'Math source changed during candidate generation/optimization');
  const { target, stage } = await stageOutput(options.out), index: BookIndex = { modes: [] };
  try {
    for (const { pool, optimized } of modes) {
      const mode = pool.mode;
      assert(pool.capAvailable && pool.candidates.some(row => row.capped), `${mode}: advertised maximum absent`);
      assert(pool.candidates.length >= MIN_RELEASE_BOOKS_PER_MODE, `${mode}: insufficient release candidates`);
      assert.equal(optimized.mode, mode); assert.equal(optimized.weights.length, pool.candidates.length);
      assert(optimized.verification.passed, `${mode}: optimization did not pass mathematical gates`);
      assert.equal(optimized.totalWeight, WEIGHT_TOTAL.toString());
      const events = `books_${mode}.jsonl.zst`, weights = `lookUpTable_${mode}_0.csv`, seeds = `seeds_${mode}.jsonl`;
      const csv = await open(path.join(stage, weights), 'wx');
      const seedFile = await open(path.join(stage, seeds), 'wx').catch(async error => { await csv.close(); throw error; });
      let weightSum = 0n;
      async function* lines(): AsyncGenerator<string> {
        for (let id = 0; id < pool.candidates.length; id++) {
          const candidate = pool.candidates[id], rawWeight = optimized.weights[id];
          assert.equal(candidate.id, id); assert.equal(candidate.mode, mode);
          assert(/^[1-9]\d*$/.test(rawWeight), 'Every candidate requires a positive integer lookup weight');
          const weight = BigInt(rawWeight); assert(weight <= WEIGHT_TOTAL); weightSum += weight;
          const book = replayCandidate(candidate);
          await csv.writeFile(`${id},${weight},${book.payoutMultiplier}\n`);
          await seedFile.writeFile(JSON.stringify(candidate) + '\n');
          yield JSON.stringify(book) + '\n';
        }
      }
      try {
        await pipeline(Readable.from(lines()), zlib.createZstdCompress({ params: { [zlib.constants.ZSTD_c_compressionLevel]: 6 } }), createWriteStream(path.join(stage, events), { flags: 'wx' }));
      } finally { await Promise.all([csv.close(), seedFile.close()]); }
      assert.equal(weightSum, WEIGHT_TOTAL, `${mode}: exported weight mass differs`);
      index.modes.push({ name: mode, cost: MODE_COST[mode], events, weights });
    }
    await writeFile(path.join(stage, 'index.json'), JSON.stringify(index, null, 2) + '\n', { flag: 'wx' });
    const generation = { generator: GENERATOR, status: 'staging-unverified', generatedAt: new Date().toISOString(), nodeVersion: process.version,
      targetRtp: '24/25', masterSeed: options.masterSeed, sources: options.sources, productionApproved: false, platformImportValidated: false,
      payoutScale: 100, totalWeightPerMode: WEIGHT_TOTAL.toString(), compression: 'streaming-zstandard',
      walletScaling: { baseBetQuantumMicro: BASE_BET_QUANTUM_MICRO, minBaseBetTemplate: MIN_BASE_BET_TEMPLATE, maxBaseBetTemplate: MAX_BASE_BET_TEMPLATE, registeredBetLimitsVerified: false,
        note: 'Exact book RTP scales without wallet rounding loss for bet levels divisible by five micro-units. Other registered levels require auditBetLevels against these final weights.' },
      recordedPactPolicy: 'Four policies are assigned before engine simulation and stored at event index zero. Weighted round selection predetermines all decisions; the client cannot change book probability.',
      modes: modes.map(({ pool, optimized }) => ({ ...pool, candidates: undefined, candidateCount: pool.candidates.length, optimization: { ...optimized, weights: undefined } })) };
    await writeFile(path.join(stage, 'generation.json'), JSON.stringify(generation, null, 2) + '\n', { flag: 'wx' });
    const verification = await verifyPackage(stage, { allowUnmanifestedStaging: true });
    assert.deepEqual(await sourceFingerprints(PROJECT), options.sources, 'Math source changed during export/verification');
    generation.status = 'verified-local-math-not-platform-approved';
    await writeFile(path.join(stage, 'generation.json'), JSON.stringify(generation, null, 2) + '\n');
    await writeFile(path.join(stage, 'verification.json'), JSON.stringify(verification, null, 2) + '\n', { flag: 'wx' });
    const files = await Promise.all((await readdir(stage)).sort().map(async name => ({ name, bytes: (await lstat(path.join(stage, name))).size, sha256: await sha256File(path.join(stage, name)) })));
    await writeFile(path.join(stage, 'manifest.json'), JSON.stringify({ generator: GENERATOR, status: generation.status, files, sourceHashes: options.sources, productionApproved: false }, null, 2) + '\n', { flag: 'wx' });
    assert(!(await exists(target)), 'Destination appeared during generation; staging output preserved');
    await rename(stage, target);
    return { directory: target, verification, status: 'verified-local-math-not-platform-approved' };
  } catch (error) {
    await writeFile(path.join(stage, 'FAILED.txt'), `UNPUBLISHED / NOT VERIFIED\n${error instanceof Error ? error.stack : String(error)}\n`).catch(() => {});
    throw new Error(`Math generation failed. No final package was published; staging files remain at ${stage}. ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** Source compatibility is checked before sampled engine replays of a package. */
export async function verifyExport(directory: string): Promise<PackageVerification> {
  const generation = JSON.parse(await readFile(path.join(directory, 'generation.json'), 'utf8')) as { sources: Record<string, string> };
  assert.deepEqual(await sourceFingerprints(PROJECT), generation.sources, 'Current engine/math source differs from the package source hashes');
  return verifyPackage(directory);
}
