// Rendert Szenen der Bühne (stage.html) zu MP4 bzw. Probebildern.
// node render.js <cues.json> <outdir> [--scenes 1,2,3] [--stills 0.3,0.6,0.9] [--jobs 3]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const [cuesPath, outDir, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const cues = JSON.parse(fs.readFileSync(cuesPath, 'utf8'));
const scenes = (arg('--scenes', cues.map(c => c.scene).join(','))).split(',').map(Number);
const stills = arg('--stills', null);
const jobs = Number(arg('--jobs', 3));
const FPS = 30;
const stage = 'file://' + path.resolve(__dirname, 'stage.html');
fs.mkdirSync(outDir, { recursive: true });

async function renderScene(browser, n) {
  const cue = cues.find(c => c.scene === n);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(stage);
  const sfx = await page.evaluate(([n, cue]) => window.initScene(n, cue), [n, cue]);
  fs.writeFileSync(path.join(outDir, `sfx_${String(n).padStart(2, '0')}.json`), JSON.stringify(sfx));
  const frames = Math.round(cue.duration * FPS);
  if (stills) {
    for (const f of stills.split(',').map(Number)) {
      const t = f <= 1 ? f * cue.duration : f;
      await page.evaluate(t => window.renderAt(t), t);
      await page.screenshot({ path: path.join(outDir, `s${String(n).padStart(2, '0')}_${t.toFixed(2)}.png`) });
    }
  } else {
    const out = path.join(outDir, `scene_${String(n).padStart(2, '0')}.mp4`);
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', '60',
      '-video_track_timescale', '15360', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = 0; i < frames; i++) {
      await page.evaluate(t => window.renderAt(t), i / FPS);
      const buf = await page.screenshot({ type: 'png' });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
  }
  await page.close();
  console.log(`Szene ${n}: ${frames} Frames${errs.length ? '  FEHLER: ' + errs.join(' | ') : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  const queue = [...scenes];
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) await renderScene(browser, queue.shift());
  }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
