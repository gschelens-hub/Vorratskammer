// Erzeugt push-gif.html: eine Animation (draw(t)), die frame-weise abfotografiert und zu einem GIF zusammengesetzt wird.
import fs from 'node:fs';
import { dogPreviewSvg } from '../../app/dogs.js';
const icon = 'data:image/png;base64,' + fs.readFileSync(new URL('../../app/icon-192.png', import.meta.url)).toString('base64');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:480px;height:480px;overflow:hidden;font-family:'Inter',sans-serif;background:#1d2025}
#s{position:relative;width:480px;height:480px;overflow:hidden;background:linear-gradient(160deg,#2b1055 0%,#7a1f6e 45%,#f2545b 85%,#ff9a3c 100%)}
.phone{position:absolute;left:115px;top:38px;width:250px;height:372px;border-radius:38px;background:#0d0f12;padding:10px;box-shadow:0 20px 40px #0008}
.screen{position:relative;width:100%;height:100%;border-radius:30px;overflow:hidden;background:linear-gradient(180deg,#3b2a6b,#1d2a4a 60%,#14202f)}
.notch{position:absolute;left:50%;top:8px;width:70px;height:18px;margin-left:-35px;border-radius:10px;background:#000;z-index:5}
.clock{position:absolute;left:0;right:0;top:46px;text-align:center;color:#fff;font:800 54px/1 'Inter Display','Inter';letter-spacing:-1px}
.date{position:absolute;left:0;right:0;top:104px;text-align:center;color:#ffffffcc;font:600 13px 'Inter'}
.note{position:absolute;left:10px;right:10px;top:0;border-radius:18px;background:#f4f4f6;color:#1d2025;padding:10px 12px;box-shadow:0 8px 18px #0006;opacity:0}
.note .h{display:flex;align-items:center;gap:6px;font:700 10px 'Inter';color:#6b6f76;text-transform:uppercase;letter-spacing:.4px}
.note .h img{width:16px;height:16px;border-radius:4px}
.note b{display:block;font:800 14px/1.2 'Inter';margin-top:5px}
.note span{display:block;font:500 13px/1.25 'Inter';margin-top:2px}
.btns{display:flex;gap:5px;margin-top:8px}
.btns i{flex:1;font-style:normal;text-align:center;font:700 11px 'Inter';padding:6px 0;border-radius:9px;background:#e4e4ea}
.btns i.hit{background:#2fa84f;color:#fff}
.finger{position:absolute;font-size:34px;opacity:0;z-index:9;filter:drop-shadow(0 3px 4px #0007)}
.desk{position:absolute;left:30px;right:30px;top:268px;height:62px;border-radius:10px;background:#8a8f98;color:#fff;padding:9px 12px;font:800 16px 'Inter';opacity:0}
.desk small{display:block;font:600 12px 'Inter';opacity:.9}
.pup{position:absolute;left:50%;top:225px;width:120px;margin-left:-60px;opacity:0}
.cap{position:absolute;left:14px;right:14px;bottom:14px;text-align:center;color:#fff;font:italic 900 25px/1.1 'Inter Display','Inter';text-shadow:3px 3px 0 #0d0618;opacity:0}
.title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;opacity:0;z-index:20;background:linear-gradient(160deg,#2b1055 0%,#7a1f6e 45%,#f2545b 85%,#ff9a3c 100%)}
.title .bell{font-size:110px;line-height:1}
.title h1{color:#fff;font:italic 900 46px/1 'Inter Display','Inter';text-shadow:4px 4px 0 #0d0618;text-align:center}
.title h1 em{display:block;font-size:30px;color:#ffd36e;margin-top:6px}
.title img{position:absolute;left:24px;top:24px;width:54px;height:54px;border-radius:13px;box-shadow:0 0 0 3px #0d0618}
.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;opacity:0;z-index:20;background:#fffdf8;color:#1d2025;text-align:center;padding:24px}
.end h2{font:900 34px/1.1 'Inter Display','Inter'}
.chip{display:inline-flex;align-items:center;gap:8px;border:2px solid #1d2025;border-radius:999px;padding:8px 18px;font:800 26px 'Inter'}
.gear{display:inline-block;font-size:30px}
.end .arrow{font:900 30px 'Inter';color:#d62d20}
.end .on{background:#1d2025;color:#fff;border-radius:14px;padding:12px 22px;font:800 22px 'Inter'}
.end p{font:600 15px/1.35 'Inter';color:#6b6f76}
</style></head><body><div id="s">
<div class="phone"><div class="screen">
  <div class="notch"></div>
  <div class="clock" id="clock">08:30</div><div class="date">Montag, 23. November</div>
  <div class="note" id="n1"><div class="h"><img src="${icon}">552 · jetzt</div><b>Guten Morgen, Luca</b><span>Bist du heute im Büro?</span>
    <div class="btns"><i id="b1">Im Büro</i><i>Mobil</i><i>Nicht da</i></div></div>
  <div class="note" id="n2"><div class="h"><img src="${icon}">552 · jetzt</div><b>📌 Neue Notiz von Marc</b><span>Kuchen in der Küche! 🍰</span></div>
  <div class="note" id="n3"><div class="h"><img src="${icon}">552 · jetzt</div><b>🐾 Hazel ist heute im Büro</b><span>Das Körbchen ist reserviert.</span></div>
  <div class="desk" id="desk">Luca<small id="deskst">Offen</small></div>
  <div class="pup" id="dog">${dogPreviewSvg('hazel').replace('class="dog-preview"', 'width="120" height="112"')}</div>
</div></div>
<div class="finger" id="finger">👆</div>
<div class="cap" id="cap"></div>
<div class="title" id="title"><img src="${icon}"><div class="bell" id="bell">🔔</div><h1>Neu in 552:<em>Push-Mitteilungen!</em></h1></div>
<div class="end" id="end"><h2>So schaltest du's ein</h2>
  <div class="chip"><span class="gear" id="gear">⚙️</span>Dein Name</div><div class="arrow">↓</div>
  <div class="on" id="on">Mitteilungen einschalten</div>
  <p>iPhone: vorher 552 über „Teilen →<br>Zum Home-Bildschirm“ installieren</p></div>
</div>
<script>
const $ = (id) => document.getElementById(id);
const clamp = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => 1 - Math.pow(1 - x, 3);
const back = (x) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const show = (t, a, b, fade = 0.25) => Math.min(seg(t, a, a + fade), 1 - seg(t, b - fade, b));
const caps = [[1.7, 4.4, 'Morgens: Bist du da?'], [4.4, 6.4, 'Neue Notiz? Alle wissen es.'], [6.4, 8.4, 'Hund im Körbchen? Ping! 🐾']];
window.draw = (t) => {
  // 0–1.8 title
  const ti = 1 - seg(t, 1.5, 1.8);
  $('title').style.opacity = ti;
  $('bell').style.transform = 'rotate(' + Math.sin(t * 22) * 18 * (1 - seg(t, 1.2, 1.5)) + 'deg) scale(' + (0.6 + 0.4 * back(seg(t, 0, 0.5))) + ')';
  // morning notification 1.8–4.4
  const a1 = back(seg(t, 1.9, 2.3)), o1 = show(t, 1.9, 4.4);
  $('n1').style.opacity = o1; $('n1').style.transform = 'translateY(' + (-120 + 258 * a1) + 'px)';
  const fx = 22 + (1 - ease(seg(t, 2.6, 3.2))) * 150, fy = 205 + (1 - ease(seg(t, 2.6, 3.2))) * 120;
  const press = seg(t, 3.25, 3.35) - seg(t, 3.45, 3.55);
  $('finger').style.opacity = show(t, 2.6, 3.9, 0.15);
  $('finger').style.transform = 'translate(' + (115 + 10 + fx) + 'px,' + (38 + 10 + fy) + 'px) scale(' + (1 - 0.15 * press) + ')';
  $('b1').className = t > 3.35 ? 'hit' : '';
  $('desk').style.opacity = show(t, 2.0, 4.4);
  const green = t > 3.5;
  $('desk').style.background = green ? '#2fa84f' : '#8a8f98';
  $('desk').style.transform = 'scale(' + (1 + 0.08 * (seg(t, 3.5, 3.6) - seg(t, 3.6, 3.8))) + ')';
  $('deskst').textContent = green ? 'Im Büro ✓' : 'Offen';
  // note 4.4–6.4
  const a2 = back(seg(t, 4.5, 4.9));
  $('n2').style.opacity = show(t, 4.5, 6.4); $('n2').style.transform = 'translateY(' + (-120 + 258 * a2) + 'px)';
  // dog 6.4–8.4
  const a3 = back(seg(t, 6.5, 6.9));
  $('n3').style.opacity = show(t, 6.5, 8.4); $('n3').style.transform = 'translateY(' + (-120 + 258 * a3) + 'px)';
  $('dog').style.opacity = show(t, 6.8, 8.4);
  $('dog').style.transform = 'translateY(' + ((1 - back(seg(t, 6.8, 7.2))) * 80 - Math.abs(Math.sin((t - 7.2) * 5)) * 8 * seg(t, 7.2, 7.3)) + 'px) rotate(' + Math.sin(t * 6) * 6 + 'deg)';
  $('clock').textContent = t < 4.4 ? '08:30' : t < 6.4 ? '10:12' : '11:47';
  // captions
  const c = caps.find(([a, b]) => t >= a && t < b);
  $('cap').textContent = c ? c[2] : '';
  $('cap').style.opacity = c ? show(t, c[0], c[1], 0.2) : 0;
  // end card 8.4–11
  $('end').style.opacity = seg(t, 8.4, 8.7);
  $('gear').style.transform = 'rotate(' + t * 140 + 'deg)';
  $('on').style.transform = 'scale(' + (1 + 0.06 * Math.max(0, Math.sin((t - 9.2) * 6)) * seg(t, 9.2, 9.3)) + ')';
};
draw(0);
</script></body></html>`;
fs.writeFileSync(new URL('./push-gif.html', import.meta.url), html);
