import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CANDIDATE_MODES, DEAL_POLICIES, MAX_PAYOUT } from './candidates';
import type { CandidatePool } from './candidates';
import type { AshenMathMode, Candidate, DealPolicyId } from './contracts';
import { MODE_COST } from './config';
import { sha256File } from './verify-books';

/** Reuse sampled seeds, never trust old payouts as new output. exportBooks
 * regenerates every candidate and compares its complete summary before writing
 * the new book. This avoids repeating a multi-million-seed maximum search when
 * an unrelated game mode was added; any old-mode engine change fails export. */
export async function readReusablePools(directory: string, requestedCount: number, masterSeed: number): Promise<Map<AshenMathMode, CandidatePool>> {
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { files: { name: string; bytes: number; sha256: string }[] };
  const index = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8')) as { modes: { name: AshenMathMode; cost: number; events: string; weights: string }[] };
  assert(Array.isArray(index.modes) && index.modes.length > 0, 'Reusable candidate archive has no modes');
  assert(new Set(index.modes.map(mode => mode.name)).size === index.modes.length, 'Repeated reusable archive mode');
  const required = ['index.json', 'generation.json', 'verification.json', ...index.modes.flatMap(mode => {
    assert(CANDIDATE_MODES.includes(mode.name), 'Reusable archive contains an unknown mode');
    assert.equal(mode.cost, MODE_COST[mode.name], 'Reusable archive mode price changed');
    assert.equal(mode.events, `books_${mode.name}.jsonl.zst`);
    assert.equal(mode.weights, `lookUpTable_${mode.name}_0.csv`);
    return [mode.events, mode.weights, `seeds_${mode.name}.jsonl`];
  })].sort();
  assert(Array.isArray(manifest.files), 'Reusable candidate manifest is missing');
  assert.deepEqual(manifest.files.map(file => file.name).sort(), required, 'Reusable archive manifest must cover every original artifact');
  for (const entry of manifest.files) {
    const filename = path.join(directory, entry.name), stat = await lstat(filename);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'Reusable artifact must be an ordinary file');
    assert.equal(stat.size, entry.bytes, `${entry.name}: reusable artifact size mismatch`);
    assert.equal(await sha256File(filename), entry.sha256, `${entry.name}: reusable artifact SHA-256 mismatch`);
  }
  const verification = JSON.parse(await readFile(path.join(directory, 'verification.json'), 'utf8')) as { pass: boolean };
  assert.equal(verification.pass, true, 'Only a previously verified candidate archive can be reused');
  const generation = JSON.parse(await readFile(path.join(directory, 'generation.json'), 'utf8')) as {
    generator: string; masterSeed: number; modes: (Omit<CandidatePool, 'candidates'> & { candidateCount: number })[];
  };
  assert.equal(generation.masterSeed, masterSeed, 'Reusable archive master seed differs from --seed');
  assert.deepEqual(generation.modes.map(mode => mode.mode), index.modes.map(mode => mode.name), 'Reusable generation/index modes differ');
  const manifestSha256 = await sha256File(manifestPath), output = new Map<AshenMathMode, CandidatePool>();
  for (const mode of generation.modes) {
    assert.equal(mode.requestedCount, requestedCount, 'Reusable candidate count differs from --count');
    const seedFile = `seeds_${mode.mode}.jsonl`;
    const candidates = (await readFile(path.join(directory, seedFile), 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line) as Candidate);
    assert.equal(candidates.length, mode.candidateCount, 'Reusable seed ledger length differs from its generation report');
    assert.equal(new Set(candidates.map(candidate => candidate.seed)).size, candidates.length, 'Repeated reusable seed');
    const policyCounts = Object.fromEntries(DEAL_POLICIES.map(policy => [policy, 0])) as Record<DealPolicyId, number>;
    candidates.forEach((candidate, id) => {
      assert.equal(candidate.id, id); assert.equal(candidate.mode, mode.mode);
      assert(Number.isSafeInteger(candidate.seed) && candidate.seed >= 0 && candidate.seed <= 0xffff_ffff, 'Invalid reusable seed');
      assert(DEAL_POLICIES.includes(candidate.policyId), 'Invalid reusable recorded policy');
      assert(Number.isSafeInteger(candidate.payoutMultiplier) && candidate.payoutMultiplier >= 0 && candidate.payoutMultiplier <= MAX_PAYOUT, 'Invalid reusable candidate payout');
      assert.equal(candidate.capped, candidate.payoutMultiplier === MAX_PAYOUT);
      policyCounts[candidate.policyId]++;
    });
    assert.deepEqual(policyCounts, mode.policyCounts, 'Reusable policy metadata differs');
    assert.equal(new Set(candidates.map(row => row.payoutMultiplier)).size, mode.payoutValues);
    assert.equal(candidates.some(row => row.capped), mode.capAvailable);
    const seedSha256 = manifest.files.find(file => file.name === seedFile)!.sha256;
    output.set(mode.mode, {
      mode: mode.mode, candidates, requestedCount: mode.requestedCount, scannedRounds: mode.scannedRounds,
      targetedAdmissions: mode.targetedAdmissions, capAvailable: mode.capAvailable, payoutValues: mode.payoutValues,
      policyCounts, seedDerivation: mode.seedDerivation, samplingNote: mode.samplingNote,
      reusedSeeds: { generator: generation.generator, manifestSha256, seedSha256,
        validation: 'Original archive hashes checked; every new book must replay to the identical candidate summary during export.' },
    });
  }
  return output;
}
