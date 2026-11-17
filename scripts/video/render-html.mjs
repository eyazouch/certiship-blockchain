#!/usr/bin/env node
/**
 * Transforme les animations HTML de docs/demo (intro, cartes de transition) en vidéos MP4 1080p.
 * Rendu image par image (temps contrôlé) : aucune saccade, quel que soit le PC.
 *
 *   node scripts/video/render-html.mjs            → toutes les vidéos
 *   node scripts/video/render-html.mjs intro      → seulement l'intro
 *   node scripts/video/render-html.mjs carte-3    → seulement la carte 3
 *
 * Prérequis : Chrome ou Edge, ffmpeg (winget install Gyan.FFmpeg).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findFfmpeg } from './ffmpeg.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const demoDir = path.join(root, 'docs', 'demo');
const outDir = path.join(demoDir, 'video');
const FPS = 30;
const W = 1920;
const H = 1080;
const PORT = 9333;

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

// Chaque vidéo : page, durée (ms) et code qui pilote la page à l'instant t (ms)
const JOBS = [
  {
    name: 'intro',
    page: 'intro.html',
    duration: 38800 + 1200,
    driver: `(t) => {
      document.body.classList.add('playing');
      let start = 0, id = SCENES[0][0];
      for (const [sid, d] of SCENES) { if (t >= start) id = sid; start += d; }
      if (window.__scene !== id) { window.__scene = id; show(id); }
    }`,
  },
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({
    name: `carte-${n}`,
    page: 'transitions.html',
    duration: n === 7 ? 5000 : 4000,
    driver: `(t) => {
      if (window.__card !== ${n}) {
        window.__card = ${n};
        play(${n - 1});
        const svg = document.getElementById('card');
        void svg.getBoundingClientRect();
        svg.classList.add('on');
      }
    }`,
  })),
];

function fail(msg) {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('connexion CDP impossible'));
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      listeners.get(msg.method)(msg.params);
      listeners.delete(msg.method);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const once = (method) => new Promise((resolve) => listeners.set(method, resolve));
  return { send, once, close: () => ws.close() };
}

async function waitForDebugger() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('le navigateur ne répond pas');
}

async function render(cdp, job, ffmpeg) {
  const url = pathToFileURL(path.join(demoDir, job.page)).href;
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await loaded;
  await new Promise((r) => setTimeout(r, 300)); // polices

  // Pilotage du temps : chaque animation CSS est mise en pause puis positionnée à t - sa naissance
  await cdp.send('Runtime.evaluate', {
    expression: `
      window.__born = new Map();
      window.__drive = ${job.driver};
      window.__step = (t) => {
        window.__drive(t);
        for (const a of document.getAnimations()) {
          if (!window.__born.has(a)) window.__born.set(a, t);
          a.pause();
          a.currentTime = Math.max(0, t - window.__born.get(a));
        }
      };`,
  });

  const frames = fs.mkdtempSync(path.join(os.tmpdir(), `certiship-${job.name}-`));
  const total = Math.round((job.duration / 1000) * FPS);
  for (let f = 0; f < total; f++) {
    const t = (f * 1000) / FPS;
    await cdp.send('Runtime.evaluate', { expression: `window.__step(${t})` });
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
    fs.writeFileSync(path.join(frames, `${String(f).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
    if (f % FPS === 0) process.stdout.write(`\r  ${job.name} : ${Math.round((f / total) * 100)} %   `);
  }

  const out = path.join(outDir, `${job.name}.mp4`);
  const enc = spawnSync(
    ffmpeg,
    ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out],
    { stdio: 'inherit' },
  );
  fs.rmSync(frames, { recursive: true, force: true });
  if (enc.status !== 0) throw new Error(`encodage de ${job.name} impossible`);
  console.log(`\r  ✔ ${path.relative(root, out)} (${(job.duration / 1000).toFixed(1)} s)`);
}

const only = process.argv[2];
const jobs = only ? JOBS.filter((j) => j.name === only) : JOBS;
if (!jobs.length) fail(`vidéo inconnue : ${only} (choix : ${JOBS.map((j) => j.name).join(', ')})`);

const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) fail('Chrome ou Edge introuvable.');
const ffmpeg = findFfmpeg() ?? fail('ffmpeg introuvable : winget install Gyan.FFmpeg');
fs.mkdirSync(outDir, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'certiship-chrome-'));
const chrome = spawn(browser, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--hide-scrollbars',
  '--allow-file-access-from-files', 'about:blank',
], { stdio: 'ignore' });

try {
  const cdp = await cdpConnect(await waitForDebugger());
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  console.log(`Rendu ${W}×${H} à ${FPS} images/s :`);
  for (const job of jobs) await render(cdp, job, ffmpeg);
  cdp.close();
} finally {
  chrome.kill();
  setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
}
