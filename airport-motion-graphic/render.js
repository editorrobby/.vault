// Render the animation to MP4.
//   node render.js [--notext] [--fps 30] [--frames DIR] [--out output/airports.mp4]
// Requires: playwright (chromium), ffmpeg. Run `python3 music.py` first for the soundtrack.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const NOTEXT = args.includes('--notext');
const FPS = +opt('--fps', 30);
const FR = path.resolve(opt('--frames', path.join(__dirname, 'frames' + (NOTEXT ? '_notext' : ''))));
const OUT = path.resolve(opt('--out', path.join(__dirname, 'output', NOTEXT ? 'airports_clean.mp4' : 'airports.mp4')));
const WORKERS = +opt('--workers', 3);

(async () => {
  fs.mkdirSync(FR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch();
  const url = 'file://' + path.resolve(__dirname, 'index.html') + '?render' + (NOTEXT ? '&notext' : '');
  const probe = await browser.newPage();
  await probe.goto(url);
  const DURATION = await probe.evaluate(() => window.DURATION);
  await probe.close();
  const total = Math.round(DURATION * FPS);
  let next = 0, done = 0;
  const t0 = Date.now();
  const worker = async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', e => console.error('PAGE ERROR', e.message));
    await page.goto(url);
    await page.evaluate(() => window.FONTS_READY);
    while (next < total) {
      const f = next++;
      const data = await page.evaluate(t => { renderAt(t); return document.getElementById('c').toDataURL('image/png'); }, f / FPS);
      fs.writeFileSync(path.join(FR, `f_${String(f).padStart(5, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
      if (++done % 60 === 0) process.stdout.write(`  ${done}/${total} frames  (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  await browser.close();
  const music = path.join(__dirname, 'output', 'music.wav');
  const ff = ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(FR, 'f_%05d.png')];
  if (fs.existsSync(music)) ff.push('-i', music, '-c:a', 'aac', '-b:a', '192k', '-shortest');
  ff.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT);
  execFileSync('ffmpeg', ff, { stdio: 'inherit' });
  console.log('wrote', OUT);
})();
