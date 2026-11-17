import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Chemin de ffmpeg (ou ffprobe) : PATH, puis dossier d'installation winget. */
export function findFfmpeg(tool = 'ffmpeg') {
  const probe = spawnSync(tool, ['-version'], { stdio: 'ignore' });
  if (probe.status === 0) return tool;
  const base = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  if (!fs.existsSync(base)) return null;
  for (const pkg of fs.readdirSync(base).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
    const pkgDir = path.join(base, pkg);
    for (const build of fs.readdirSync(pkgDir)) {
      const exe = path.join(pkgDir, build, 'bin', `${tool}.exe`);
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}
