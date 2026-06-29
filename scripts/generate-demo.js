// Regenerates the README demo (docs/demo.gif + docs/demo.mp4) by driving the
// real running app through the screening flow in a headless browser.
//
// Prerequisites:
//   - The app is running locally:  npm start   (http://localhost:3000)
//   - Google Chrome is installed
//   - ffmpeg is installed and on PATH
//   - devDependency `puppeteer-core` is installed
//
// Usage:   node scripts/generate-demo.js
//
// It captures numbered PNG frames to a temp dir, then ffmpeg stitches them into
// a 15fps MP4 (1280-wide) and an autoplay-friendly GIF (1000-wide).

const puppeteer = require('puppeteer-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.env.DEMO_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const FRAMES_DIR = process.env.FRAMES_DIR || path.join(os.tmpdir(), 'mss-demo-frames');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let frameNo = 0;
async function snap(page) {
  frameNo++;
  await page.screenshot({ path: path.join(FRAMES_DIR, `frame-${String(frameNo).padStart(4, '0')}.png`) });
}
async function hold(page, n) { for (let i = 0; i < n; i++) await snap(page); }

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

  await page.evaluate((css) => {
    const c = document.createElement('div');
    c.id = '__cur';
    c.setAttribute('style', css);
    document.body.appendChild(c);
  }, CURSOR_CSS);
  let cur = { x: 640, y: 300 };

  const T_SCREEN = 'button.tab[data-tab="lookup"]';
  const T_MEDIA  = '#tab-lookup button.check-toggle-btn[data-check="media"]';
  const T_INPUT  = '#lookup-name';
  const T_RUN    = '#tab-lookup .btn-primary.btn-full';

  await hold(page, 24);                                                   // dashboard

  cur = await moveCursor(page, cur, await centerOf(page, T_SCREEN), 14);  // → Screen tab
  await hold(page, 2);
  await page.click(T_SCREEN);
  await sleep(350);
  await hold(page, 10);

  cur = await moveCursor(page, cur, await centerOf(page, T_MEDIA), 10);   // sanctions-only
  await page.click(T_MEDIA);
  await hold(page, 6);

  cur = await moveCursor(page, cur, await centerOf(page, T_INPUT), 10);   // type a sanctioned name
  await page.click(T_INPUT);
  await hold(page, 4);
  for (const ch of 'Vladimir Putin') { await page.type(T_INPUT, ch); await snap(page); await snap(page); }
  await hold(page, 4);

  cur = await moveCursor(page, cur, await centerOf(page, T_RUN), 10);     // run → confirmed match
  await hold(page, 2);
  await page.click(T_RUN);
  for (let i = 0; i < 6; i++) { await snap(page); await sleep(70); }
  await page.waitForFunction(
    () => { const el = document.querySelector('#lookup-results'); return el && el.querySelector('.result-status-bar'); },
    { timeout: 15000 }
  ).catch(() => {});
  await sleep(300);
  await hold(page, 34);

  cur = await moveCursor(page, cur, await centerOf(page, T_INPUT), 8);    // clean name → clear
  await page.click(T_INPUT, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await snap(page);
  for (const ch of 'Jane Smith Bakery LLC') { await page.type(T_INPUT, ch); await snap(page); }
  await hold(page, 3);
  cur = await moveCursor(page, cur, await centerOf(page, T_RUN), 8);
  await page.click(T_RUN);
  for (let i = 0; i < 5; i++) { await snap(page); await sleep(70); }
  await page.waitForFunction(
    () => { const el = document.querySelector('#lookup-results'); return el && el.querySelector('.result-status-bar'); },
    { timeout: 15000 }
  ).catch(() => {});
  await sleep(300);
  await hold(page, 30);

  await browser.close();
  return frameNo;
}

function encode() {
  const pattern = path.join(FRAMES_DIR, 'frame-%04d.png');
  const palette = path.join(FRAMES_DIR, 'palette.png');
  fs.mkdirSync(DOCS, { recursive: true });
  // MP4
  execFileSync('ffmpeg', ['-y', '-framerate', '15', '-i', pattern,
    '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', path.join(DOCS, 'demo.mp4')], { stdio: 'ignore' });
  // GIF (two-pass palette)
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
