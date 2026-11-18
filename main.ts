// Token Radar — the entry point (Node 22, standard library only).
//
// The program reads the sealed snapshot — /input/snapshot.json by
// default, or --input <snapshot.json|directory> — and scores every
// pre-token protocol with the radar-3 model in lib/model.ts. It writes
// the ranked board to /output/board.json, the data.js the dashboard
// reads, copies this repository's dashboard/ and screenshots/ into
// /output, and last writes /output/dossier.json, the summary the judge
// reads, with the vendored make.fun library.
//
// radar-3 fits its value model from the snapshot's own live tokens (a
// log-log size curve with per-category levels), keeps a model term only
// when the leave-one-out blind test keeps it, costs every farm plan to
// a computed verdict, and bands every row with a 200-refit bootstrap.
// The full method lives in lib/model.ts.
//
// The dashboard is a static page, no framework and no network:
// dashboard/index.html, dashboard/app.css and dashboard/app.js read
// /output/data.js, which this program writes from the same board, so
// the page, the board and the screenshots always agree. The run is
// fully deterministic: the same snapshot bytes always produce the
// same output bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output — the output directory is created as needed:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import type { BoardRow, RadarData, Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** Caps the scorer enforces (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const VALID_SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read one --flag <value> (or --flag=value) out of the arguments, or the fallback. */
function flagValue(flag: string, fallback: string): string {
  const argv = process.argv;
  const at = argv.indexOf(`--${flag}`);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1]!;
  const joined = argv.find((entry) => entry.startsWith(`--${flag}=`));
  return joined === undefined ? fallback : joined.slice(flag.length + 3);
}

/** Where the run reads from and writes to: the snapshot path and the output directory. */
function readCli(): { snapshotPath: string; destination: string } {
  const given = flagValue('input', '/input');
  const snapshotPath = given.endsWith('.json') ? given : join(given, 'snapshot.json');
  const destination = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  return { snapshotPath, destination };
}

/** Read and parse the sealed snapshot, refusing when the file is not there. */
function loadSnapshot(snapshotPath: string): Snapshot {
  if (!existsSync(snapshotPath)) {
    process.stderr.write(
      `token radar: no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input\n`,
    );
    process.exit(2);
  }
  return parseSnapshot(readFileSync(snapshotPath, 'utf8'));
}

/** Score the snapshot and refuse a board the gate will not take. */
function scoreSnapshot(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
    process.exit(1);
  }
  return { board, radar };
}

/** Copy one directory's regular files into `target`, skipping names that start with a dot. */
function copyDirectory(source: string, target: string): string[] {
  if (!existsSync(source)) return [];
  mkdirSync(target, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(source)) {
    if (name.startsWith('.')) continue;
    const path = join(source, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(target, name));
    copied.push(name);
  }
  return copied;
}

/** The three screenshots the board must hand in, with names the gate accepts. */
function checkScreenshots(shots: string[]): void {
  if (shots.length < 3) {
    process.stderr.write(
      `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`,
    );
    process.exit(1);
  }
  for (const name of shots) {
    if (!VALID_SHOT_NAME.test(name)) {
      process.stderr.write(
        `token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`,
      );
      process.exit(1);
    }
  }
}

/** Write the board, the data script, the dashboard and screenshots, and the dossier last. */
function writeOutputs(
  board: BoardRow[],
  radar: RadarData,
  destination: string,
): { dashboardCount: number; screenshotCount: number } {
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(destination, 'data.js'), dataScript(radar));

  const dashboardCount = copyDirectory(join(repoRoot, 'dashboard'), join(destination, 'dashboard')).length;
  const shots = copyDirectory(join(repoRoot, 'screenshots'), join(destination, 'screenshots'));
  checkScreenshots(shots);

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(
    join(destination, 'dossier.json'),
    buildDossier(destination, {
      text_max_bytes: DOSSIER_TEXT_CAP,
      screenshots: SHOT_LIMITS,
      dashboard: { max_files: 400, max_bytes: 4_194_304 },
    }),
  );
  return { dashboardCount, screenshotCount: shots.length };
}

const { snapshotPath, destination } = readCli();
const snapshot = loadSnapshot(snapshotPath);
const { board, radar } = scoreSnapshot(snapshot);
const { dashboardCount, screenshotCount } = writeOutputs(board, radar, destination);

const kept = Object.keys(radar.model.kept_terms).join(', ') || 'none';
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: radar-3 fit on ${radar.model.live_count} live tokens, LOO miss x${radar.model.loo_x_factor} (median |log err| ${radar.model.loo_median_abs_log_err}), kept terms: ${kept}\n` +
    `token radar: verdicts FARM ${radar.model.verdict_counts.FARM} / THIN ${radar.model.verdict_counts.THIN} / SKIP ${radar.model.verdict_counts.SKIP}\n` +
    `token radar: wrote ${join(destination, 'board.json')}, ${join(destination, 'data.js')}, ${join(destination, 'dashboard')} (${dashboardCount} files), ${join(destination, 'screenshots')} (${screenshotCount} images) and ${join(destination, 'dossier.json')}\n`,
);
