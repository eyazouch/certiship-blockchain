#!/usr/bin/env node
/**
 * Monte la vidéo de démonstration finale (1080p, 30 images/s).
 *
 *   node scripts/video/montage.mjs
 *
 * Entrées (dossier docs/demo/rushes/) :
 *   clip2.mp4 … clip8.mp4, clip5a.mp4, clip5b.mp4   enregistrements d'écran
 *   voix-intro.m4a, voix-clip2.m4a …                voix off (facultatif, un fichier par séquence)
 *   musique.mp3                                     musique de fond (facultatif)
 *   montage.json                                    coupes (facultatif), par exemple :
 *     { "clip2": { "garder": [[2.5, 31], [44, 70]] }, "clip6": { "garder": [[0, 9], [21, 48]] } }
 *
 * Les animations (intro, cartes) viennent de docs/demo/video/ (scripts/video/render-html.mjs).
 * Sortie : docs/demo/video/CertiShip-demo.mp4
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFfmpeg } from './ffmpeg.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rushes = process.env.RUSHES_DIR || path.join(root, 'docs', 'demo', 'rushes');
const animations = path.join(root, 'docs', 'demo', 'video');
const output = process.env.MONTAGE_OUT || path.join(animations, 'CertiShip-demo.mp4');
const W = 1920, H = 1080, FPS = 30;
const BG = '0x070b18';

// Ordre de la vidéo. « voix » : nom du fichier de voix off associé (sans extension).
const SEQUENCE = [
  { id: 'intro', dir: animations, voix: 'voix-intro' },
  { id: 'carte-1', dir: animations },
  { id: 'clip2', dir: rushes, voix: 'voix-clip2' },
  { id: 'carte-2', dir: animations },
  { id: 'clip3', dir: rushes, voix: 'voix-clip3' },
  { id: 'carte-3', dir: animations },
  { id: 'clip4', dir: rushes, voix: 'voix-clip4' },
  { id: 'carte-4', dir: animations },
  { id: 'clip5a', dir: rushes, voix: 'voix-clip5a' },
  { id: 'clip5b', dir: rushes, voix: 'voix-clip5b' },
  { id: 'carte-5', dir: animations },
  { id: 'clip6a', dir: rushes, voix: 'voix-clip6a' },
  { id: 'clip6', dir: rushes, voix: 'voix-clip6' },
  { id: 'carte-6', dir: animations },
  { id: 'clip7', dir: rushes, voix: 'voix-clip7' },
  { id: 'clip8', dir: rushes, voix: 'voix-clip8' },
  { id: 'carte-7', dir: animations },
];
const VIDEO_EXT = ['.mp4', '.mov', '.mkv', '.webm'];
const AUDIO_EXT = ['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.opus', '.wma'];

const ffmpeg = findFfmpeg('ffmpeg');
const ffprobe = findFfmpeg('ffprobe');
if (!ffmpeg || !ffprobe) {
  console.error('✘ ffmpeg introuvable : winget install Gyan.FFmpeg');
  process.exit(1);
}

const find = (dir, base, exts) => exts.map((e) => path.join(dir, base + e)).find((p) => fs.existsSync(p));
const duration = (file) =>
  Number(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout);
function run(args) {
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg a échoué');
}

const config = fs.existsSync(path.join(rushes, 'montage.json'))
  ? JSON.parse(fs.readFileSync(path.join(rushes, 'montage.json'), 'utf8'))
  : {};

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'certiship-montage-'));
const parts = [];
const missing = [];
let total = 0;

console.log('Montage de la vidéo :');
for (const seg of SEQUENCE) {
  const video = find(seg.dir, seg.id, VIDEO_EXT);
  if (!video) {
    missing.push(seg.id);
    continue;
  }
  const voice = seg.voix ? find(rushes, seg.voix, AUDIO_EXT) : null;

  // Passages conservés (coupes) → longueur de l'image
  const keep = config[seg.id]?.garder ?? [[0, duration(video)]];
  const imageLength = keep.reduce((s, [a, b]) => s + (b - a), 0);
  const voiceLength = voice ? duration(voice) + 0.6 : 0; // 0,3 s de silence avant et après
  const length = Math.max(imageLength, voiceLength);

  const trims = keep
    .map(([a, b], i) => `[0:v]trim=${a}:${b},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1,fps=${FPS}[k${i}]`)
    .join(';');
  const join = `${keep.map((_, i) => `[k${i}]`).join('')}concat=n=${keep.length}:v=1:a=0`;
  // Si la voix est plus longue que l'image, la dernière image reste affichée
  const hold = length > imageLength ? `,tpad=stop_mode=clone:stop_duration=${(length - imageLength).toFixed(3)}` : '';
  const audio = voice
    ? `[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=300|300,apad,atrim=0:${length.toFixed(3)}[a]`
    : `anullsrc=r=48000:cl=stereo,atrim=0:${length.toFixed(3)}[a]`;

  const out = path.join(work, `${String(parts.length).padStart(2, '0')}-${seg.id}.mp4`);
  run([
    '-i', video, ...(voice ? ['-i', voice] : []),
    '-filter_complex', `${trims};${join}${hold},format=yuv420p[v];${audio}`,
    '-map', '[v]', '-map', '[a]', '-t', length.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', out,
  ]);
  parts.push(out);
  total += length;
  console.log(`  ✔ ${seg.id.padEnd(8)} ${length.toFixed(1).padStart(5)} s${voice ? '  + voix' : ''}${config[seg.id] ? '  (coupé)' : ''}`);
}

if (!parts.length) {
  console.error('✘ Aucune séquence trouvée.');
  process.exit(1);
}

// Assemblage
const list = path.join(work, 'liste.txt');
fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
const joined = path.join(work, 'assemble.mp4');
run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

// Musique de fond (facultative), discrète sous la voix, fondu final
const music = find(rushes, 'musique', AUDIO_EXT);
if (music) {
  run([
    '-i', joined, '-stream_loop', '-1', '-i', music,
    '-filter_complex',
    `[1:a]volume=0.10,afade=t=in:d=2,afade=t=out:st=${Math.max(0, total - 3).toFixed(2)}:d=3[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), output,
  ]);
} else {
  fs.copyFileSync(joined, output);
}
fs.rmSync(work, { recursive: true, force: true });

const m = Math.floor(total / 60), s = Math.round(total % 60);
console.log(`\n✔ ${path.relative(root, output)} — ${m} min ${String(s).padStart(2, '0')} s${music ? ' (avec musique)' : ''}`);
if (missing.length) console.log(`⚠ Séquences absentes (ignorées) : ${missing.join(', ')}`);
