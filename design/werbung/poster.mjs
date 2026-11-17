// Generates a Vice-City-style promo poster for 552 (original artwork, no game logos).
import fs from 'node:fs';
import { basketSvg } from '/home/user/Vorratskammer/app/dogs.js';

const icon = 'data:image/png;base64,' + fs.readFileSync('/home/user/Vorratskammer/app/icon-512.png').toString('base64');

const palm = (flip = false) => `
<svg viewBox="0 0 300 900" class="palm${flip ? ' flip' : ''}">
  <path d="M60 900 C70 760 110 600 140 470 C158 390 172 300 182 236 L194 240 C188 304 176 394 160 474 C134 604 98 764 96 900 Z" fill="#1a0b2e"/>
  <g stroke="#2a1446" stroke-width="3" fill="none" opacity=".8"><path d="M86 820 l26 6 M102 720 l26 6 M118 620 l24 6 M134 530 l22 6 M150 440 l20 6 M162 360 l18 5 M172 290 l16 5"/></g>
  <g fill="#1a0b2e">
    <path d="M186 236 C120 200 60 214 4 268 C66 226 124 222 186 248 Z"/>
    <path d="M186 236 C140 160 80 132 10 150 C84 150 136 184 182 248 Z"/>
    <path d="M186 236 C196 150 238 100 296 84 C244 120 210 168 192 246 Z"/>
    <path d="M186 236 C250 196 300 212 330 260 C286 228 240 226 190 248 Z"/>
    <path d="M186 236 C182 168 156 112 112 76 C168 108 196 160 196 240 Z"/>
    <path d="M186 236 C232 240 268 280 284 340 C258 296 224 266 186 252 Z"/>
    <path d="M186 236 C140 250 100 294 86 352 C112 302 146 270 188 252 Z"/>
  </g>
</svg>`;

const deskPanel = `
<svg viewBox="0 20 400 260" class="fill" preserveAspectRatio="xMidYMid meet">
  <rect width="400" height="300" fill="#fffdf8"/>
  <g>
    <circle cx="300" cy="52" r="26" fill="#2f3237"/><path d="M268 46 A34 34 0 0 1 332 46" stroke="#2f3237" stroke-width="12" fill="none" stroke-linecap="round"/>
    <rect x="215" y="90" width="170" height="82" rx="8" fill="#2fa84f"/>
    <rect x="15" y="186" width="170" height="82" rx="8" fill="#e8b923"/>
    <rect x="215" y="186" width="170" height="82" rx="8" fill="#d64541"/>
    <g fill="#000" opacity=".2"><rect x="255" y="158" width="90" height="7" rx="3"/><rect x="55" y="194" width="90" height="7" rx="3"/><rect x="255" y="194" width="90" height="7" rx="3"/></g>
    <g font-family="Inter" font-weight="900" fill="#fff" font-size="26">
      <text x="230" y="125">Julia</text><text x="30" y="221" fill="#2a2100">Marc</text><text x="230" y="221">Luca</text>
    </g>
    <g font-family="Inter" font-weight="700" fill="#fff" font-size="15" opacity=".9">
      <text x="230" y="146">Im Büro</text><text x="30" y="242" fill="#2a2100">Mobil</text><text x="230" y="242">Nicht da</text>
    </g>
  </g>
</svg>`;

const calPanel = `
<svg viewBox="0 0 400 200" class="fill" preserveAspectRatio="xMidYMid slice">
  <rect width="400" height="200" fill="#fffdf8"/>
  <rect width="400" height="22" fill="#1f2328"/>
  ${[60, 130, 200, 270, 340].map((x) => `<rect x="${x - 4}" y="-6" width="8" height="22" rx="4" fill="#9aa0a6"/>`).join('')}
  <g font-family="Inter" text-anchor="middle">
    ${['MO', 'DI', 'MI', 'DO', 'FR']
      .map((d, i) => `<text x="${40 + i * 80}" y="80" font-size="16" font-weight="600" fill="#6b6f76">${d}</text><text x="${40 + i * 80}" y="130" font-size="44" font-weight="800" fill="${i === 2 ? '#d62d20' : '#1f2328'}">${16 + i}</text>`)
      .join('')}
  </g>
  ${[0, 1, 2, 3, 4].map((i) => `<g transform="translate(${40 + i * 80 - 18} 150)"><circle cx="4" cy="4" r="5" fill="#2fa84f"/><circle cx="18" cy="4" r="5" fill="${i % 2 ? '#e8b923' : '#2fa84f'}"/><circle cx="32" cy="4" r="5" fill="${i === 4 ? '#d64541' : '#2fa84f'}"/></g>`).join('')}
  <rect x="166" y="48" width="68" height="128" rx="12" fill="none" stroke="#d62d20" stroke-width="6"/>
</svg>`;

const dogPanel = (dog, bg) => `
<div class="dogbg" style="background:${bg}">${basketSvg(dog).replace('class="basket-svg', 'class="basket-svg static')}</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; }
body { width: 1080px; height: 1350px; overflow: hidden; font-family: 'Inter Display', 'Inter', sans-serif; }
.poster { position: relative; width: 1080px; height: 1350px; overflow: hidden;
  background: linear-gradient(180deg, #1b0b3a 0%, #4a1066 22%, #b21f74 44%, #f2545b 60%, #ff9a3c 72%, #ffd36e 78%, #2fc6c9 78.2%, #128ea8 88%, #0b4f6e 100%); }
.stars { position: absolute; inset: 0 0 50% 0; background-image: radial-gradient(1.5px 1.5px at 20% 15%, #fff8, transparent), radial-gradient(1.5px 1.5px at 70% 8%, #fff9, transparent), radial-gradient(1px 1px at 45% 22%, #fff7, transparent), radial-gradient(1.5px 1.5px at 88% 26%, #fff6, transparent), radial-gradient(1px 1px at 10% 32%, #fff6, transparent); }
.sun { position: absolute; left: 50%; top: 640px; width: 640px; height: 640px; transform: translate(-50%, -50%); border-radius: 50%;
  background: linear-gradient(180deg, #fff3a0 0%, #ffc04d 40%, #ff6a5a 75%, #ff3d7f 100%);
  -webkit-mask: repeating-linear-gradient(180deg, #000 0 26px, transparent 26px 34px) bottom / 100% 46% no-repeat, linear-gradient(#000, #000) top / 100% 54% no-repeat;
  filter: drop-shadow(0 0 60px #ff7a5acc); }
.sea-lines { position: absolute; left: 0; right: 0; top: 1053px; height: 297px;
  background: repeating-linear-gradient(180deg, transparent 0 18px, #ffffff22 18px 21px); }
.reflect { position: absolute; left: 50%; top: 1053px; width: 520px; height: 260px; transform: translateX(-50%);
  background: linear-gradient(180deg, #ffb26baa, transparent); -webkit-mask: repeating-linear-gradient(180deg, #000 0 8px, transparent 8px 20px); filter: blur(1px); }
.palm { position: absolute; width: 330px; height: 990px; bottom: 250px; left: -60px; }
.palm.flip { left: auto; right: -70px; transform: scaleX(-1); height: 900px; }
.panels { position: absolute; left: 70px; right: 70px; top: 455px; height: 470px; display: grid; grid-template-columns: 1.25fr 1fr; grid-template-rows: 1fr 1fr; gap: 16px; transform: rotate(-3deg); }
.panel { position: relative; border: 7px solid #0d0618; background: #0d0618; box-shadow: 10px 12px 0 #0d0618aa, 0 0 0 3px #ffffff55; overflow: hidden; }
.panel.big { grid-row: span 2; }
.panel .fill { display: block; width: 100%; height: 100%; }
.panel svg.fill { object-fit: cover; }
.panel .cap.top { top: 0; bottom: auto; }
.panel .cap { position: absolute; left: 0; bottom: 0; background: #0d0618; color: #fff; font: italic 900 22px/1 'Inter Display'; padding: 8px 14px 10px; letter-spacing: .5px; text-transform: uppercase; }
.dogbg { width: 100%; height: 100%; display: flex; align-items: flex-end; justify-content: center; padding: 34px 4px 0; }
.dogbg svg { width: 100%; height: auto; margin-bottom: -6px; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #0d0618; height: 100%; }
.title { position: absolute; left: 0; right: 0; top: 56px; text-align: center; }
.title .kicker { display: inline-block; font: italic 800 30px/1 'Inter'; color: #1b0b3a; background: #ffd36e; padding: 8px 20px 10px; letter-spacing: 3px; transform: skewX(-10deg) rotate(-2deg); box-shadow: 6px 6px 0 #0d0618; text-transform: uppercase; }
.big552 { font: italic 900 250px/0.86 'Inter Display'; letter-spacing: -10px; margin-top: 18px;
  background: linear-gradient(180deg, #fff6c9 0%, #ffd36e 30%, #ff8a3d 55%, #ff3d7f 80%, #b21f74 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  -webkit-text-stroke: 7px #0d0618; paint-order: stroke fill; filter: drop-shadow(10px 10px 0 #0d0618) drop-shadow(0 0 30px #ff3d7f88); transform: rotate(-4deg); }
.big552 small { font-size: 120px; letter-spacing: -4px; }
.slogan { position: absolute; left: 0; right: 0; bottom: 140px; text-align: center; transform: rotate(-3deg); }
.slogan .line1 { font: italic 900 92px/1 'Inter Display'; color: #fff; letter-spacing: -2px; -webkit-text-stroke: 5px #0d0618; paint-order: stroke fill; filter: drop-shadow(7px 7px 0 #0d0618); }
.slogan .line2 { display: inline-block; margin-top: 10px; font: italic 900 106px/1 'Inter Display'; letter-spacing: -3px; word-spacing: 22px;
  background: linear-gradient(90deg, #2fe0d0, #55b8ff 45%, #ff5fa2); -webkit-background-clip: text; background-clip: text; color: transparent;
  -webkit-text-stroke: 6px #0d0618; paint-order: stroke fill; filter: drop-shadow(8px 8px 0 #0d0618) drop-shadow(0 0 28px #2fe0d088); }
.footer { position: absolute; left: 50px; right: 50px; bottom: 34px; display: flex; align-items: center; justify-content: space-between; color: #fff; font: italic 800 24px/1.1 'Inter'; text-shadow: 3px 3px 0 #0d0618; }
.footer img { width: 74px; height: 74px; border-radius: 18px; box-shadow: 0 0 0 4px #0d0618, 6px 6px 0 4px #0d0618; }
.footer .left { display: flex; align-items: center; gap: 18px; }
.footer .url { font-size: 22px; opacity: .95; text-align: right; }
.badge { position: absolute; right: 34px; top: 30px; width: 150px; height: 150px; border-radius: 50%; background: #d62d20; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  font: italic 900 27px/1 'Inter Display'; transform: rotate(12deg); box-shadow: 0 0 0 6px #0d0618, 8px 8px 0 6px #0d0618; z-index: 5; text-transform: uppercase; }
.badge small { font-size: 17px; font-weight: 800; margin-top: 6px; letter-spacing: 1px; }
</style></head><body>
<div class="poster">
  <div class="stars"></div>
  <div class="sun"></div>
  <div class="reflect"></div>
  <div class="sea-lines"></div>
  ${palm()}${palm(true)}
  <div class="title">
    <span class="kicker">Zimmer 552 · Berlin</span>
    <div class="big552">552<small>-APP</small></div>
  </div>
  <div class="badge">Jetzt<br>live<small>im Büro</small></div>
  <div class="panels">
    <div class="panel big" style="background:#fffdf8">${deskPanel}<span class="cap">Wer ist heute da?</span></div>
    <div class="panel">${calPanel}<span class="cap">Woche im Griff</span></div>
    <div class="panel"><div class="split">${dogPanel('hazel', 'linear-gradient(180deg,#ffcf8a,#ff8a6a)')}${dogPanel('koko', 'linear-gradient(180deg,#9ee7ff,#5aa9ff)')}</div><span class="cap top">Hazel &amp; Koko</span></div>
  </div>
  <div class="slogan">
    <div class="line2">NOCH VOR GTA VI</div>
  </div>
  <div class="footer">
    <div class="left"><img src="${icon}" alt=""><span>Büro. Status. Hunde.<br>Alles in einer App.</span></div>
    <div class="url">552.gschelens.workers.dev</div>
  </div>
</div></body></html>`;

fs.writeFileSync(new URL('./poster.html', import.meta.url), html); // render poster.html at 1080x1350 (2x) to PNG
