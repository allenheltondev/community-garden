import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { PROGRESS_PATHS } from './config.mjs';

export async function readProgress(step) {
  const file = PROGRESS_PATHS[step];
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

export async function writeProgress(step, lastProcessedIndex, inputChecksum) {
  const file = PROGRESS_PATHS[step];
  const payload = { step, lastProcessedIndex, inputChecksum, updatedAt: new Date().toISOString() };
  await fsp.mkdir(new URL('.', `file://${file}`), { recursive: true }).catch(() => {});
  await fsp.writeFile(file, JSON.stringify(payload, null, 2));
}

export async function verifyChecksum(step, currentChecksum) {
  const p = await readProgress(step);
  if (!p) return;
  if (p.inputChecksum !== currentChecksum) {
    throw new Error(`Input checksum mismatch for step ${step}. Run with --reset.`);
  }
}

export async function resetProgress(step) {
  const file = PROGRESS_PATHS[step];
  if (file && fs.existsSync(file)) await fsp.unlink(file);
}
