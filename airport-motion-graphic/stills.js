// Render individual frames to PNG for review:  node stills.js out_dir t1 t2 ...
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const [out, ...times] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  page.on('console', m => m.type() === 'error' && console.error('CONSOLE', m.text()));
  await page.goto('file://' + path.resolve(__dirname, 'index.html') + '?render');
  await page.evaluate(() => window.FONTS_READY);
  for (const t of times) {
    const data = await page.evaluate(t => { renderAt(+t); return document.getElementById('c').toDataURL('image/jpeg', 0.9); }, t);
    fs.writeFileSync(path.join(out, `t_${(+t).toFixed(2).padStart(6, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
  }
  await browser.close();
})();
