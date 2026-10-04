import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCandidatePool, CANDIDATE_MODES } from './candidates';
import { exportBooks, PROJECT, verifyExport } from './export';
import type { PreparedMode } from './export';
import { MIN_RELEASE_BOOKS_PER_MODE } from './config';
import { optimizeCandidates } from './optimize';
import { requireZstandard, sourceFingerprints } from './verify-books';
import { readReusablePools } from './reuse';

interface GenerateArguments { command: 'generate'; count: number; seed: number; maxSearchRounds: number; out: string; reuseCandidates?: string }
interface VerifyArguments { command: 'verify'; directory: string }
export type MathArguments = GenerateArguments | VerifyArguments;
const integer = (value: string, label: string, min: number, max: number) => {
  assert(/^\d+$/.test(value), `${label} must be an integer`); const parsed = Number(value);
  assert(Number.isSafeInteger(parsed) && parsed >= min && parsed <= max, `${label} must be ${min}..${max}`); return parsed;
};
export function parseArguments(args: readonly string[]): MathArguments {
  const command = args[0] ?? 'generate'; assert(command === 'generate' || command === 'verify', 'Command must be generate or verify');
  const values = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    assert((command === 'generate' ? ['--count', '--seed', '--max-search', '--out', '--reuse-candidates'] : ['--directory']).includes(flag), `Unknown argument ${flag}`);
    assert(!values.has(flag), `Duplicate argument ${flag}`); assert(value !== undefined && !value.startsWith('--'), `Missing value for ${flag}`); values.set(flag, value);
  }
  if (command === 'verify') { const directory = values.get('--directory'); assert(directory, 'verify requires --directory'); return { command, directory }; }
  const count = integer(values.get('--count') ?? '100000', 'Count per mode', MIN_RELEASE_BOOKS_PER_MODE, 1_000_000);
  return { command, count, seed: integer(values.get('--seed') ?? '670096', 'Master seed', 0, 0xffff_ffff),
    maxSearchRounds: integer(values.get('--max-search') ?? '20000000', 'Natural-seed search bound', count, 100_000_000), out: values.get('--out') ?? 'work/ashen-math-96-eclipse',
    ...(values.has('--reuse-candidates') ? { reuseCandidates: values.get('--reuse-candidates')! } : {}) };
}

export async function runMath(args: readonly string[]): Promise<void> {
  const options = parseArguments(args); requireZstandard();
  if (options.command === 'verify') {
    const result = await verifyExport(path.resolve(PROJECT, options.directory));
    console.log(JSON.stringify({ directory: options.directory, pass: result.pass, modes: result.modes.map(mode => ({ mode: mode.mode, books: mode.books, replayed: mode.replayedBooks, rtp: mode.statistics.rtpPercent })), productionApproved: false }, null, 2)); return;
  }
  const sources = await sourceFingerprints(PROJECT), prepared: PreparedMode[] = [];
  const reused = options.reuseCandidates ? await readReusablePools(path.resolve(PROJECT, options.reuseCandidates), options.count, options.seed) : new Map();
  for (const mode of CANDIDATE_MODES) {
    const pool = reused.get(mode) ?? buildCandidatePool(mode, { count: options.count, seed: options.seed, maxSearchRounds: options.maxSearchRounds,
      onProgress: progress => console.log(JSON.stringify({ phase: 'natural-engine-candidates', ...progress })) });
    const optimized = optimizeCandidates(mode, pool.candidates);
    assert(optimized.verification.passed, `${mode}: optimizer did not meet the configured mathematical requirements: ${optimized.verification.failures.join('; ')}`);
    prepared.push({ pool, optimized });
    console.log(JSON.stringify({ phase: 'optimized', mode, books: pool.candidates.length, scannedRounds: pool.scannedRounds,
      targetedAdmissions: pool.targetedAdmissions, exactWeight: optimized.totalWeight, targetRtp: optimized.targetRtp, optionalTargetsMet: optimized.diagnostics.optionalTargetsMet }));
  }
  const result = await exportBooks(prepared, { out: options.out, sources, masterSeed: options.seed });
  console.log(JSON.stringify({ directory: result.directory, status: result.status, sixModesVerified: result.verification.modes.length === 6,
    productionApproved: false, platformImportValidated: false, note: 'Local mathematical verification does not establish platform approval, a star rating, or registered bet limits.' }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('ASHEN PACT six-mode Eclipse math pipeline — execute and verify before treating any output as generated.\nNode with native streaming Zstandard required.\nnode --import tsx math/ashen/cli.ts generate --count 100000 --seed 670096 --max-search 20000000 --reuse-candidates work/ashen-math-96 --out work/ashen-math-96-eclipse\nnode --import tsx math/ashen/cli.ts verify --directory work/ashen-math-96-eclipse\nGeneration never replaces an existing output. Reused archives must pass every original hash; every new book is regenerated and checked against its seed summary. Omit --reuse-candidates for a fresh bounded search. All outcomes come from real seeded engine rounds; no gallery presets.');
  else runMath(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; });
}
