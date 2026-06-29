// Regenerates the README demo (docs/demo.gif + docs/demo.mp4) by driving the
// real running app through a full product tour in a headless browser, with a
// caption overlay describing each page:
//   Dashboard → Screen (single, confirmed match) → Batch Screening (CSV upload
//   + run) → Jobs & Reports (results + distribution) → Settings.
//
// Prerequisites:
//   - The app is running locally:  npm start   (http://localhost:3000)
//   - Google Chrome is installed; ffmpeg is on PATH
//   - devDependency `puppeteer-core` is installed
//
// Usage:   node scripts/generate-demo.js

const puppeteer = require('puppeteer-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.env.DEMO_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const CSV = path.join(__dirname, 'demo-merchants.csv');
const FRAMES_DIR = process.env.FRAMES_DIR || path.join(os.tmpdir(), 'mss-demo-frames');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let frameNo = 0;
async function snap(page) {
  frameNo++;
  await page.screenshot({ path: path.join(FRAMES_DIR, `frame-${String(frameNo).padStart(4, '0')}.png`) });
}
async function hold(page, n) { for (let i = 0; i < n; i++) await snap(page); }
const waitFor = (page, fn, timeout = 12000) => page.waitForFunction(fn, { timeout }).catch(() => {});

// Capture frames while polling a readiness predicate (so live loading states,
// e.g. the adverse-media spinner, are recorded rather than skipped).
async function captureUntil(page, readyFn, maxFrames = 70, delayMs = 120) {
  for (let i = 0; i < maxFrames; i++) {
    await snap(page);
    if (await page.evaluate(readyFn)) return true;
    await sleep(delayMs);
  }
  return false;
}

async function setCaption(page, text) {
  await page.evaluate((t) => { const c = document.getElementById('__cap'); if (c) c.textContent = t; }, text);
}
async function centerOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
}
async function moveCursor(page, from, to, steps) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
    const x = from.x + (to.x - from.x) * ease;
    const y = from.y + (to.y - from.y) * ease;
    await page.evaluate((x, y) => { const c = document.getElementById('__cur'); if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; } }, x, y);
    await snap(page);
  }
  return to;
}

const CURSOR_CSS =
  "position:fixed;left:640px;top:300px;width:24px;height:24px;z-index:2147483647;pointer-events:none;" +
  "filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));background-repeat:no-repeat;background-position:center;background-size:contain;" +
  "background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='white' stroke='%230C0E14' stroke-width='1.5'><path d='M5 3l14 7-6 2-2 6z'/></svg>\");";

const CAPTION_CSS =
  "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:78%;padding:11px 22px;" +
  "background:rgba(12,14,20,.92);border:1px solid #2E3547;border-left:3px solid #006CFF;border-radius:9px;" +
  "color:#EEF0F7;font-family:Inter,-apple-system,sans-serif;font-size:16px;font-weight:600;letter-spacing:-0.01em;" +
  "text-align:center;z-index:2147483646;pointer-events:none;box-shadow:0 8px 32px rgba(0,0,0,.5);";

async function capture() {
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: path.join(FRAMES_DIR, '..', 'mss-demo-chrome'),
    args: ['--no-sandbox', '--hide-scrollbars', '--force-color-profile=srgb'],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 },
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await sleep(1000);

  // Inject the fake cursor + caption overlay
  await page.evaluate((cur, cap) => {
    const c = document.createElement('div'); c.id = '__cur'; c.setAttribute('style', cur); document.body.appendChild(c);
    const k = document.createElement('div'); k.id = '__cap'; k.setAttribute('style', cap); document.body.appendChild(k);
  }, CURSOR_CSS, CAPTION_CSS);
  let cur = { x: 640, y: 300 };

  const tab = t => `button.tab[data-tab="${t}"]`;
  async function gotoTab(t, settle = 400) {
    cur = await moveCursor(page, cur, await centerOf(page, tab(t)), 12);
    await page.click(tab(t));
    await sleep(settle);
  }

  // ── 1. Dashboard ────────────────────────────────────────────────────────
  await setCaption(page, 'Dashboard · 46,927 entries across 6 global sanctions lists');
  await hold(page, 26);

  // ── 2. Screen: single name → sanctions + adverse media ──────────────────
  await gotoTab('lookup');
  await setCaption(page, 'Screen · one name, checked against sanctions + adverse media');
  await hold(page, 12);
  // (leave BOTH checks on — sanctions AND adverse media)
  cur = await moveCursor(page, cur, await centerOf(page, '#lookup-name'), 10);
  await page.click('#lookup-name');
  await hold(page, 3);
  for (const ch of 'Bashar al-Assad') { await page.type('#lookup-name', ch); await snap(page); await snap(page); }
  await hold(page, 3);
  cur = await moveCursor(page, cur, await centerOf(page, '#tab-lookup .btn-primary.btn-full'), 10);
  await page.click('#tab-lookup .btn-primary.btn-full');
  await setCaption(page, 'Screen · fetching live news — adverse media may take a moment…');
  await captureUntil(page, () => { const el = document.querySelector('#lookup-results'); return el && el.querySelector('.result-status-bar'); }, 80, 120);
  await sleep(300);
  // sanctions section first
  await page.evaluate(() => window.scrollTo(0, 0));
  await setCaption(page, 'Sanctions · fuzzy match — confirmed against the OFAC list');
  await hold(page, 26);
  // reveal the adverse-media section
  await setCaption(page, 'Adverse Media · live news scanned for fraud, corruption & sanctions');
  await page.evaluate(() => {
    const secs = document.querySelectorAll('#lookup-results .results-section');
    const last = secs[secs.length - 1];
    if (last) last.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await hold(page, 32);
  await page.evaluate(() => window.scrollTo(0, 0));
  await hold(page, 4);

  // ── 3. Batch Screening: upload CSV + run ─────────────────────────────────
  await gotoTab('batch');
  await setCaption(page, 'Batch Screening · upload a CSV of merchants to screen at once');
  await hold(page, 10);
  cur = await moveCursor(page, cur, await centerOf(page, '#tab-batch button.check-toggle-btn[data-check="media"]'), 10);
  await page.click('#tab-batch button.check-toggle-btn[data-check="media"]'); // sanctions-only
  await hold(page, 4);
  cur = await moveCursor(page, cur, await centerOf(page, '#batch-job-name'), 8);
  await page.click('#batch-job-name');
  for (const ch of 'Merchant Review - Q2 2026') { await page.type('#batch-job-name', ch); await snap(page); }
  await hold(page, 3);
  const fileInput = await page.$('#file-input');
  await fileInput.uploadFile(CSV);
  await waitFor(page, () => !document.getElementById('file-chip').classList.contains('hidden'), 5000);
  await hold(page, 8);
  cur = await moveCursor(page, cur, await centerOf(page, '#batch-submit-btn'), 10);
  await page.click('#batch-submit-btn'); // uploads
  await waitFor(page, () => { const l = document.querySelector('#batch-submit-btn .batch-submit-label'); return l && /start/i.test(l.textContent); }, 15000);
  await setCaption(page, 'Batch Screening · run sanctions checks on every row');
  await hold(page, 8);
  await page.click('#batch-submit-btn'); // starts the job
  await sleep(500);
  await hold(page, 8);
  await sleep(2500); // let the 10-row batch finish server-side

  // ── 4. Jobs & Reports: open the job → distribution + results ─────────────
  await gotoTab('jobs');
  await setCaption(page, 'Jobs & Reports · status breakdown, full results & CSV export');
  await waitFor(page, () => document.querySelector('#jobs-list .job-row'), 8000);
  await hold(page, 8);
  cur = await moveCursor(page, cur, await centerOf(page, '#jobs-list .job-row'), 10);
  await page.click('#jobs-list .job-row');
  await waitFor(page, () => { const p = document.getElementById('results-panel'); return p && !p.classList.contains('hidden') && document.querySelector('.distribution-bar'); }, 10000);
  await sleep(400);
  await hold(page, 34);

  // ── 5. Settings ──────────────────────────────────────────────────────────
  await gotoTab('settings');
  await setCaption(page, 'Settings · tune thresholds, schedules & sanction-list sources');
  await sleep(300);
  await hold(page, 18);
  await page.evaluate(() => window.scrollBy({ top: 380, left: 0, behavior: 'instant' }));
  await hold(page, 16);
  await page.evaluate(() => window.scrollTo(0, 0));
  await hold(page, 8);

  await browser.close();
  return frameNo;
}

function encode() {
  const pattern = path.join(FRAMES_DIR, 'frame-%04d.png');
  const palette = path.join(FRAMES_DIR, 'palette.png');
  fs.mkdirSync(DOCS, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-framerate', '15', '-i', pattern,
    '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', path.join(DOCS, 'demo.mp4')], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-framerate', '15', '-i', pattern,
    '-vf', 'scale=1000:-1:flags=lanczos,palettegen=stats_mode=diff', palette], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-framerate', '15', '-i', pattern, '-i', palette,
    '-lavfi', 'scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3',
    path.join(DOCS, 'demo.gif')], { stdio: 'ignore' });
}

(async () => {
  const n = await capture();
  console.log(`Captured ${n} frames → encoding…`);
  encode();
  console.log('Done: docs/demo.mp4 + docs/demo.gif');
})().catch(e => { console.error('generate-demo failed:', e.message); process.exit(1); });
