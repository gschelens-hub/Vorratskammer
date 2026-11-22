// 552 – Zimmer-App
import { BASKET, basketSvg, DOGS, dogPreviewSvg } from './dogs.js';
import { ZITATE } from './zitate.js';
import { db, DbError, isDemo, LS, newMemberId, newRoomCode, setActor } from './data.js';
import {
  addDays,
  diffDays,
  DESKS,
  formatShort,
  fromISO,
  berlinHour,
  holidayName,
  inOffice,
  officeShare,
  isBridgeDay,
  isoWeek,
  mondayOf,
  MONTHS,
  planMatches,
  PLAN,
  planned,
  resolveDay,
  STATUSES,
  todayBerlin,
  weekday,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
} from './logic.js';

// ---------- state ----------
const today0 = todayBerlin();
const firstWorkday = (t) => (weekday(t) >= 5 ? addDays(t, 7 - weekday(t)) : t);
const state = {
  session: readSession(), // { room, memberId }
  view: LS.get('552.view', 'room'),
  today: today0,
  weekStart: mondayOf(firstWorkday(today0)),
  selected: firstWorkday(today0),
  data: { members: [], plans: [], overrides: [], guests: [], board: [], dogs: [] },
  sheetOpen: false,
  editPlanId: null,
  unsubscribe: null,
};

function readSession() {
  try {
    const s = JSON.parse(LS.get('552.session', 'null'));
    return s && s.room ? s : null;
  } catch {
    return null;
  }
}
function saveSession() {
  LS.set('552.session', state.session ? JSON.stringify(state.session) : null);
  setActor(state.session?.memberId);
}

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const room = () => state.session?.room;
const me = () => state.data.members.find((m) => m.id === state.session?.memberId) || null;
const member = (id) => state.data.members.find((m) => m.id === id);
const deskOwner = (deskId) => state.data.members.find((m) => m.desk === deskId) || null;
const weekDays = () => [0, 1, 2, 3, 4].map((i) => addDays(state.weekStart, i));
const dayInfo = (mid, iso) => resolveDay(mid, iso, state.data.plans, state.data.overrides);
// status colour as style + data attribute (striped statuses get their pattern via CSS)
const stAttr = (s) => `style="--c:${STATUSES[s].color}" data-s="${s}"`;
const BASE_STATUSES = ['office', 'mobile', 'away'];
/** Text for a day, e.g. "Mobil" or "vorm. Büro · nachm. Mobil". */
const statusText = (info) => (info.split ? `vorm. ${STATUSES[info.status].label} · nachm. ${STATUSES[info.statusPm].label}` : STATUSES[info.status].label);
/** Colour dot / overview cell for a day; split days are coloured top = morning, bottom = afternoon. */
const dayMark = (cls, info, title = '') =>
  info.split
    ? `<i class="${cls} split" style="--c:${STATUSES[info.status].color};--c2:${STATUSES[info.statusPm].color}" data-s="${info.status}" data-s2="${info.statusPm}" title="${esc(title || statusText(info))}"></i>`
    : `<i class="${cls}" ${stAttr(info.status)} title="${esc(title || statusText(info))}"></i>`;
/** Desk background layer for one status (KreditNext keeps its stripes). */
const deskLayer = (st) =>
  st === 'kreditnext'
    ? 'repeating-linear-gradient(135deg, color-mix(in srgb, #2fa84f 90%, transparent) 0 2.4cqw, color-mix(in srgb, #d64541 90%, transparent) 2.4cqw 4.8cqw)'
    : `linear-gradient(color-mix(in srgb, ${STATUSES[st].color} 86%, transparent), color-mix(in srgb, ${STATUSES[st].color} 86%, transparent))`;
function extraAllowed(mid) {
  const k = state.cfg?.kreditnext;
  if (!k || !k.on) return false;
  if (Array.isArray(k.members) && k.members.length) return k.members.includes(mid);
  return (member(mid)?.name || '').trim().toLowerCase() === 'julia';
}
const statusesFor = (mid) => (extraAllowed(mid) ? [...BASE_STATUSES, 'kreditnext'] : BASE_STATUSES);
const guestFor = (desk, iso) => state.data.guests.find((g) => g.desk === desk && g.date === iso);

// ---------- data ----------
let loadSeq = 0;
async function load() {
  if (!room()) return;
  const seq = ++loadSeq;
  try {
    const d = await db.load(room(), state.weekStart, addDays(state.weekStart, 6));
    if (seq !== loadSeq) return;
    state.data = d;
    $('#dbbanner').hidden = true;
    if (!me()) return showSetup('who');
    // a new day began while the app was open (e.g. Friday -> Saturday): jump to the right week
    if (todayBerlin() !== state.today) return goToday();
    render();
  } catch (err) {
    console.error(err);
    $('#dbbanner').hidden = false;
  }
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 250);
}

async function mutate(fn, okMessage) {
  try {
    await fn();
    if (okMessage) toast(okMessage);
    await load();
    return true;
  } catch (err) {
    toast(err instanceof DbError ? 'Speichern fehlgeschlagen: ' + err.message : 'Speichern fehlgeschlagen');
    return false;
  }
}

// ---------- rendering ----------
function render() {
  document.body.dataset.view = state.view;
  $('#tab-room').setAttribute('aria-selected', state.view === 'room');
  $('#tab-plan').setAttribute('aria-selected', state.view === 'plan');
  $('#me-chip').innerHTML = `<svg class="gear" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)"/></svg><span>${esc(me()?.name || '…')}</span>`;
  $('#me-chip').setAttribute('aria-label', `Einstellungen (${me()?.name || ''})`);
  $('#room-chip').textContent = room() || '';
  $('#demo-flag').hidden = !isDemo;
  if (state.view === 'room') {
    renderQuote();
    renderPushHint();
    renderWeekbar();
    renderRoom();
    renderBoard();
    renderOverview();
  } else {
    renderPlan();
  }
}

// ---------- quote of the day ----------
/** Same quote for everyone: counts working days since 5.1.2026, weekends keep Friday's quote. */
/** Stable id of a quote (from its text), used to hide single quotes for good. */
const quoteId = (z) => {
  let h = 0;
  for (const ch of z.lines.map((l) => l.text).join('|')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};
function activeQuotes() {
  const hidden = new Set(state.cfg?.quotes?.hidden || []);
  return ZITATE.filter((z) => !hidden.has(quoteId(z)));
}
function quoteOfDay(iso) {
  const list = activeQuotes();
  if (!list.length) return null;
  const epoch = '2026-01-05'; // a Monday
  const days = Math.max(0, diffDays(epoch, iso));
  const workdays = Math.floor(days / 7) * 5 + Math.min(days % 7, 4);
  const offset = Number(state.cfg?.quotes?.offset) || 0; // "Nächstes Zitat" in the developer menu
  return list[(((workdays + offset) % list.length) + list.length) % list.length];
}
function renderQuote() {
  const el = $('#quote');
  const t = state.today;
  const z = quoteOfDay(t);
  const show = state.cfg?.features?.quotes !== false && LS.get('552.quoteClosed') !== t && Boolean(z);
  el.hidden = !show;
  if (!show) return;
  const single = z.lines.length === 1;
  // stage directions like "(whispers)" are shown in italics and kept outside the quotation marks
  const dir = (t) => esc(t).replace(/\(([^)]+)\)/g, '<em class="quote-dir">($1)</em>');
  const body = z.lines
    .map((l) => {
      if (!single) return `<p class="quote-text"><strong>${esc(l.who.split(' ')[0])}:</strong> ${dir(l.text)}</p>`;
      const m = l.text.match(/^\(([^)]+)\)\s*(.*)$/s);
      const lead = m ? `<em class="quote-dir">(${esc(m[1])})</em> ` : '';
      const rest = (m ? m[2] : l.text).replace(/„/g, '‚').replace(/“/g, '‘');
      return `<p class="quote-text">${lead}„${dir(rest)}“</p>`;
    })
    .join('');
  const who = single ? z.lines[0].who : [...new Set(z.lines.map((l) => l.who))].join(' & ');
  el.innerHTML = `<div class="quote-body">${body}<p class="quote-src"><em>${esc(who)} – ${esc(z.source)}</em></p></div>
    <button type="button" class="quote-x" aria-label="Zitat für heute schließen">✕</button>`;
  el.querySelector('.quote-x').addEventListener('click', () => {
    LS.set('552.quoteClosed', t);
    el.classList.add('closing');
    setTimeout(() => {
      el.classList.remove('closing');
      el.hidden = true;
    }, 220);
  });
}

function renderWeekbar() {
  const days = weekDays();
  const first = fromISO(days[0]);
  const last = fromISO(days[4]);
  $('#cal-month').textContent =
    first.getUTCMonth() === last.getUTCMonth()
      ? `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`
      : `${MONTHS[first.getUTCMonth()].slice(0, 3)} – ${MONTHS[last.getUTCMonth()].slice(0, 3)} ${last.getUTCFullYear()}`;
  $('#cal-kw').textContent = `KW ${isoWeek(days[0])}`;
  $('#cal-today').hidden = days.includes(state.today);

  const people = state.data.members;
  const initials = memberInitials(people);
  const dogsOn = state.cfg?.features?.dogs === true;
  $('#cal-days').innerHTML = days
    .map((iso, i) => {
      const hol = holidayName(iso);
      const dots = people
        .map((p) => {
          const info = dayInfo(p.id, iso);
          return `<span class="cal-person" title="${esc(p.name)}: ${esc(statusText(info))}">${dayMark('dot', info, `${p.name}: ${statusText(info)}`)}<b>${esc(initials[p.id])}</b></span>`;
        })
        .join('');
      const dog = dogsOn ? dogOn(iso) : null;
      const paw = dog ? `<span class="cal-paw" title="${esc(DOGS[dog].name)} ist da">${PAW_SVG}</span>` : '';
      return `<button class="cal-day${iso === state.today ? ' is-today' : ''}${hol ? ' is-holiday' : ''}" data-day="${i}" role="tab" aria-selected="${iso === state.selected}" aria-label="${WEEKDAYS_LONG[i]} ${formatShort(iso)}${hol ? ', ' + esc(hol) : ''}">
        <span class="cal-wd">${WEEKDAYS_SHORT[i]}</span>
        <span class="cal-num">${fromISO(iso).getUTCDate()}</span>
        <span class="cal-dots">${dots}</span>
        ${paw}
        ${hol ? `<span class="cal-tag">${esc(hol)}</span>` : isBridgeDay(iso) ? '<span class="cal-tag bridge">Brückentag</span>' : ''}
      </button>`;
    })
    .join('');
  moveSlider(Math.max(0, days.indexOf(state.selected)));
}

const GHOST_SVG = `<svg viewBox="0 0 40 46" width="26" height="30" aria-hidden="true">
  <path d="M20 2C10 2 4 10 4 20v22l5-4 5 4 6-4 6 4 5-4 5 4V20C36 10 30 2 20 2Z" fill="#fff" stroke="#cfd3da" stroke-width="1.5"/>
  <ellipse class="ghost-eye" cx="14.5" cy="19" rx="2.6" ry="3.4" fill="#2b2e33"/><ellipse class="ghost-eye" cx="25.5" cy="19" rx="2.6" ry="3.4" fill="#2b2e33"/>
  <ellipse cx="20" cy="28" rx="3" ry="3.6" fill="#2b2e33"/>
  <ellipse cx="10" cy="25" rx="2.4" ry="1.4" fill="#ffb3c1" opacity=".8"/><ellipse cx="30" cy="25" rx="2.4" ry="1.4" fill="#ffb3c1" opacity=".8"/>
</svg>`;

/** Initials for the week bar: first letter, or more letters if two people share it. */
function memberInitials(people) {
  const out = {};
  for (const p of people) {
    const name = (p.name || '?').trim();
    let n = 1;
    while (n < name.length && people.some((o) => o.id !== p.id && (o.name || '').trim().slice(0, n).toLowerCase() === name.slice(0, n).toLowerCase())) n++;
    out[p.id] = name.slice(0, n).toUpperCase().slice(0, 1) + name.slice(1, n).toLowerCase();
  }
  return out;
}
const PAW_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><g fill="currentColor"><ellipse cx="12" cy="16.2" rx="5.2" ry="4.3"/><ellipse cx="5.4" cy="10.6" rx="2.2" ry="2.8"/><ellipse cx="9.4" cy="6.4" rx="2.2" ry="2.9"/><ellipse cx="14.6" cy="6.4" rx="2.2" ry="2.9"/><ellipse cx="18.6" cy="10.6" rx="2.2" ry="2.8"/></g></svg>';

function moveSlider(index, px = null) {
  const slider = $('#cal-slider');
  slider.style.transform = px === null ? `translateX(${index * 100}%)` : `translateX(${px}px)`;
  slider.classList.toggle('dragging', px !== null);
}

function renderRoom() {
  const iso = state.selected;
  const hol = holidayName(iso);
  $('#day-title').innerHTML = `${WEEKDAYS_LONG[weekday(iso)]}, ${formatShort(iso)}${
    iso === state.today ? ' <span class="pill">heute</span>' : ''
  }${hol ? ` <span class="pill grey">${esc(hol)}</span>` : ''}${isBridgeDay(iso) ? ' <span class="pill bridge">Brückentag</span>' : ''}`;

  $('#desks').innerHTML = DESKS.map((desk) => {
    const owner = deskOwner(desk.id);
    const guest = guestFor(desk.id, iso);
    const pos = `left:${desk.x}%;top:${desk.y}%;width:${desk.w}%;height:${desk.h}%`;
    const guestTag = guest ? `<span class="desk-guest">Gast: ${esc(guest.guest_name)}</span>` : '';
    if (!owner) {
      return `<button class="desk status-unknown free${guest ? ' has-guest' : ''}" style="${pos};--c:${STATUSES.unknown.color}" data-desk="${desk.id}" data-note-pos="${desk.notePos}"
        aria-label="Freier Tisch ${desk.label}${guest ? ', Gast ' + esc(guest.guest_name) : ''}">
        <span class="desk-head"><span class="desk-name">Frei</span></span>${guestTag}</button>`;
    }
    const info = dayInfo(owner.id, iso);
    const st = STATUSES[info.status];
    const note = info.note ? `<span class="desk-note">${esc(info.note)}</span>` : '';
    const isMe = owner.id === me()?.id ? ' is-me' : '';
    const src =
      info.source === 'override'
        ? info.overridden
          ? '<span class="desk-src" title="Für diesen Tag geändert">✎</span>'
          : ''
        : info.source === 'plan' || info.source === 'turnus'
          ? `<span class="desk-src" title="Aus der Planung">${info.source === 'turnus' ? '↻' : '▤'}</span>`
          : '';
    const aria = `${esc(owner.name)}: ${esc(info.split ? `vormittags ${STATUSES[info.status].label}, nachmittags ${STATUSES[info.statusPm].label}` : st.label)}${info.note ? ', ' + esc(info.note) : ''}${guest ? ', Gast ' + esc(guest.guest_name) : ''}`;
    if (info.split) {
      // split day: desk divided across, top = morning, bottom = afternoon; after 13:00 today the morning fades
      const past = iso === state.today && berlinHour() >= 13 ? ' am-past' : '';
      return `<button class="desk split${guest ? ' has-guest' : ''}${isMe}${past}"
          style="${pos};background:${deskLayer(info.status)} top / 100% 50% no-repeat, ${deskLayer(info.statusPm)} bottom / 100% 50% no-repeat"
          data-desk="${desk.id}" data-note-pos="${desk.notePos}" aria-label="${aria}">
          <span class="split-row am"><span class="desk-name">${esc(owner.name)}</span><span class="half-label">vorm. ${STATUSES[info.status].label}</span>${src}</span>
          <span class="split-row pm">${guestTag}<span class="half-label">nachm. ${STATUSES[info.statusPm].label}</span></span>
          ${note}
        </button>`;
    }
    return `<button class="desk status-${info.status}${guest ? ' has-guest' : ''}${isMe}"
        style="${pos};--c:${st.color}" data-desk="${desk.id}" data-note-pos="${desk.notePos}"
        aria-label="${aria}">
        <span class="desk-head"><span class="desk-name">${esc(owner.name)}</span>${src}</span>
        <span class="desk-status">${guest && info.status !== 'office' ? '' : st.label}</span>
        ${guestTag}${note}
      </button>`;
  }).join('');

  renderBasket();

  // members without a desk
  const deskless = state.data.members.filter((m) => !m.desk);
  $('#deskless').hidden = !deskless.length;
  $('#deskless').innerHTML = deskless.length
    ? `<span class="muted">Ohne festen Tisch:</span> ` +
      deskless
        .map((m) => {
          const info = dayInfo(m.id, iso);
          return `<button class="chip" data-member="${m.id}" style="--c:${STATUSES[info.status].color}">${dayMark('dot', info)}${esc(m.name)}${info.note ? ` · ${esc(info.note)}` : ''}</button>`;
        })
        .join('')
    : '';
}

// ---------- dog basket ----------
let basketKey = null;
const dogOn = (iso) => (state.data.dogs || []).find((d) => d.date === iso)?.dog || null;
function renderBasket() {
  const el = $('#basket');
  const on = state.cfg?.features?.dogs === true;
  el.hidden = !on;
  if (!on) return;
  const dog = dogOn(state.selected);
  el.setAttribute('aria-label', dog ? `Im Körbchen: ${DOGS[dog].name}` : 'Hundekörbchen – leer');
  el.title = dog ? `${DOGS[dog].name} (${DOGS[dog].breed})` : 'Hundekörbchen';
  const key = String(dog);
  if (key === basketKey) return; // keep running animations, only redraw when the dog changes
  basketKey = key;
  el.innerHTML = basketSvg(dog) + (dog ? `<span class="basket-name">${DOGS[dog].name}</span>` : '<span class="basket-name empty">Wer kommt?</span>');
}

function hearts() {
  const el = $('#basket');
  for (let i = 0; i < 6; i++) {
    const h = document.createElement('span');
    h.className = 'heart';
    h.textContent = '❤';
    h.style.left = 30 + Math.random() * 40 + '%';
    h.style.animationDelay = i * 0.12 + 's';
    h.style.setProperty('--dx', (Math.random() * 2 - 1) * 30 + 'px');
    el.appendChild(h);
    setTimeout(() => h.remove(), 2200);
  }
}

function openBasket() {
  const iso = state.selected;
  const current = dogOn(iso);
  openSheet(
    `<header class="sheet-head"><h2>Wer liegt im Körbchen?</h2><p>${WEEKDAYS_LONG[weekday(iso)]}, ${formatShort(iso)}${iso.slice(0, 4)}</p></header>
     <div class="dog-pick">
       ${Object.entries(DOGS)
         .map(
           ([id, d]) => `<button type="button" class="dog-opt${current === id ? ' on' : ''}" data-dog="${id}">
             ${dogPreviewSvg(id)}<strong>${d.name}</strong><span>${d.breed}</span></button>`,
         )
         .join('')}
     </div>
     <button type="button" class="btn ghost wide-btn" data-dog="">Körbchen bleibt leer</button>`,
    (root) => {
      root.querySelectorAll('[data-dog]').forEach((b) =>
        b.addEventListener('click', async () => {
          const dog = b.dataset.dog || null;
          closeSheet();
          if (dog === current) return;
          const ok = await mutate(() => db.setDog(room(), iso, dog));
          if (ok && dog) {
            setTimeout(hearts, 350);
            notifyPush('dog', { date: iso });
          }
        }),
      );
    },
  );
}

const NOTE_COLORS = { yellow: '#fff3a8', pink: '#ffd1dc', blue: '#cfe8ff', green: '#d4f5c9' };

const noteTitle = (n) => (n.title || '').trim() || (n.text || '').trim().split('\n')[0].slice(0, 40) || 'Notiz';

function renderBoard() {
  const notes = state.data.board
    .map(
      (n, i) =>
        `<button class="sticky" data-note="${n.id}" style="--note:${NOTE_COLORS[n.color] || NOTE_COLORS.yellow};--r:${((i * 37) % 7) - 3}deg">
          <span class="sticky-title">${esc(noteTitle(n))}</span>${n.author_name ? `<span class="sticky-author">${esc(n.author_name)}</span>` : ''}
        </button>`,
    )
    .join('');
  $('#board').innerHTML = `<div class="board-head"><h3>Pinnwand</h3><button type="button" class="btn small" data-note-add>+ Notiz</button></div>
    <div class="board-notes">${notes || '<p class="muted small">Noch nichts angepinnt.</p>'}</div>`;
}

/** Draws the furniture (desks + chairs) once; the coloured desk buttons lie on top. */
function renderFurniture() {
  const chair = ([cx, cy], backUp) => {
    const base = backUp ? -90 : 90;
    const pt = (deg, r) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
    const [x1, y1] = pt(base - 58, 74);
    const [x2, y2] = pt(base + 58, 74);
    const dir = backUp ? -1 : 1;
    return `<g>
      <path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A74 74 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" class="f-back"/>
      <rect x="${cx - 74}" y="${cy - 32 + dir * 10}" width="20" height="62" rx="9" class="f-dark"/>
      <rect x="${cx + 54}" y="${cy - 32 + dir * 10}" width="20" height="62" rx="9" class="f-dark"/>
      <circle cx="${cx}" cy="${cy}" r="56" fill="url(#seat)"/></g>`;
  };
  const desk = (d) => {
    const [x, y, w, h] = d.rect;
    const mx = x + w / 2;
    const monitor =
      d.notePos === 'above'
        ? `<rect x="${mx - 127}" y="${y + h - 50}" width="254" height="14" rx="7" class="f-dark"/><rect x="${mx - 20}" y="${y + h - 40}" width="40" height="30" rx="5" class="f-dark"/>`
        : `<rect x="${mx - 20}" y="${y + 10}" width="40" height="30" rx="5" class="f-dark"/><rect x="${mx - 127}" y="${y + 36}" width="254" height="14" rx="7" class="f-dark"/>`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" class="f-desk" filter="url(#deskShadow)"/>${monitor}`;
  };
  $('#furniture').setAttribute('viewBox', `${PLAN.x} ${PLAN.y} ${PLAN.w} ${PLAN.h}`);
  Object.assign($('#basket').style, {
    left: `${((BASKET.x - PLAN.x) / PLAN.w) * 100}%`,
    top: `${((BASKET.y - PLAN.y) / PLAN.h) * 100}%`,
    width: `${(BASKET.w / PLAN.w) * 100}%`,
    height: `${(BASKET.h / PLAN.h) * 100}%`,
  });
  $('#furniture').innerHTML = `<defs>
      <radialGradient id="seat" cx="45%" cy="40%" r="65%"><stop offset="0" class="f-seat-hi"/><stop offset="1" class="f-seat-lo"/></radialGradient>
      <filter id="deskShadow" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".16"/></filter>
    </defs>
    ${DESKS.map((d) => chair(d.chair, d.notePos === 'above')).join('')}
    ${DESKS.map(desk).join('')}`;
}

function renderOverview() {
  const days = weekDays();
  const people = state.data.members;
  const deskPeople = people.filter((p) => p.desk);
  // "komplett": everybody with a desk in the office at the same time (whole morning or whole afternoon)
  const full = deskPeople.length
    ? days.filter(
        (iso) =>
          deskPeople.every((p) => dayInfo(p.id, iso).status === 'office') || deskPeople.every((p) => dayInfo(p.id, iso).statusPm === 'office'),
      )
    : [];
  const kw = isoWeek(days[0]);
  let summary;
  if (full.length === 0) summary = `KW ${kw}: noch kein Tag, an dem alle im Büro sind.`;
  else if (full.length === 1) summary = `KW ${kw}: 1× komplett – am ${WEEKDAYS_LONG[weekday(full[0])]}.`;
  else summary = `KW ${kw}: ${full.length}× komplett – ${full.map((d) => WEEKDAYS_SHORT[weekday(d)]).join(', ')}.`;

  const hints = [];
  for (const iso of days) {
    if (!isBridgeDay(iso)) continue;
    const open = people.filter((p) => planned(p.id, iso, state.data.plans).source !== 'plan').map((p) => p.name);
    hints.push(`${WEEKDAYS_SHORT[weekday(iso)]} ${formatShort(iso)} ist Brückentag${open.length ? ` – noch kein Urlaub geplant: ${open.join(', ')}` : ''}.`);
  }
  for (let i = 7; i < 42; i++) {
    const iso = addDays(state.weekStart, i);
    if (isBridgeDay(iso)) {
      hints.push(`Nächster Brückentag: ${WEEKDAYS_LONG[weekday(iso)]}, ${formatShort(iso)} – schon Urlaub geplant?`);
      break;
    }
  }

  // nobody in the office (everyone mobile / away / KreditNext, nobody still open) -> a little ghost haunts that day
  const gone = ['mobile', 'away', 'kreditnext'];
  const empty = (iso) =>
    people.length > 0 &&
    people.every((p) => {
      const info = dayInfo(p.id, iso);
      return gone.includes(info.status) && gone.includes(info.statusPm);
    });
  const anyGhost = days.some(empty);
  const head = days
    .map(
      (iso, i) => `<th scope="col">${empty(iso) ? `<span class="spook" style="--d:${(-i * 1.3).toFixed(2)}s;--rows:${people.length}" title="Keiner im Büro – hier spukt's">${GHOST_SVG}</span>` : ''}<button data-pick="${iso}" class="${iso === state.selected ? 'sel' : ''}">${WEEKDAYS_SHORT[weekday(iso)]}</button></th>`,
    )
    .join('');
  const rows = people
    .map((p) => {
      const cells = days
        .map((iso) => {
          return `<td>${dayMark('cell', dayInfo(p.id, iso))}</td>`;
        })
        .join('');
      const officeDays = days.reduce((sum, iso) => sum + officeShare(dayInfo(p.id, iso)), 0);
      const shown = Number.isInteger(officeDays) ? `${officeDays}` : `${Math.floor(officeDays) || ''}½`;
      return `<tr><th scope="row">${esc(p.name)}</th>${cells}<td class="count">${shown}×</td></tr>`;
    })
    .join('');
  const counts = days.map((iso) => `<td class="count">${people.filter((p) => inOffice(dayInfo(p.id, iso))).length}</td>`).join('');
  const anySplit = days.some((iso) => people.some((p) => dayInfo(p.id, iso).split));

  $('#overview').innerHTML = `
    <h3>Wochenüberblick</h3>
    <p class="summary">${esc(summary)}</p>
    <table class="matrix${anyGhost ? ' has-ghost' : ''}">
      <thead><tr><th></th>${head}<th class="count" title="Bürotage">Büro</th></tr></thead>
      <tbody>${rows}<tr class="total"><th scope="row">im Büro</th>${counts}<td></td></tr></tbody>
    </table>
    ${hints.map((h) => `<p class="hint">${esc(h)}</p>`).join('')}
    <p class="legend">${Object.entries(STATUSES)
      .filter(([k]) => k !== 'kreditnext' || state.data.members.some((m) => extraAllowed(m.id)))
      .map(([k, s]) => `<span><i class="dot" ${stAttr(k)}></i>${esc(s.label)}</span>`)
      .join('')}${anySplit ? `<span><i class="dot split" style="--c:${STATUSES.office.color};--c2:${STATUSES.mobile.color}"></i>oben vorm., unten nachm.</span>` : ''}<span>✎ geändert</span><span>▤ geplant</span><span>↻ Turnus</span></p>`;
}

// ---------- planning view ----------
const KIND_LABEL = { absence: 'Urlaub / Abwesenheit', single: 'Einzeltermin', recurring: 'Turnus' };
const NTH_LABEL = { 1: '1.', 2: '2.', 3: '3.', 4: '4.', '-1': 'letzten' };

const HALF_LABEL = { am: 'vormittags', pm: 'nachmittags' };
function describePlan(p) {
  const st = STATUSES[p.status].label + (p.half ? ` (${HALF_LABEL[p.half]})` : '');
  if (p.kind === 'absence') return `${formatShort(p.start_date)} – ${formatShort(p.end_date)}${p.end_date.slice(0, 4)} · ${st}`;
  if (p.kind === 'single') return `${WEEKDAYS_SHORT[weekday(p.start_date)]} ${formatShort(p.start_date)}${p.start_date.slice(0, 4)} · ${st}`;
  const rule =
    p.repeat === 'weekly'
      ? `${p.interval > 1 ? `alle ${p.interval} Wochen` : 'jeden'} ${WEEKDAYS_LONG[p.weekday]}`
      : `jeden ${NTH_LABEL[p.nth]} ${WEEKDAYS_LONG[p.weekday]} im Monat`;
  return `${rule} · ${st} · ab ${formatShort(p.start_date)}${p.end_date ? ` bis ${formatShort(p.end_date)}` : ''}`;
}

function nextDates(p, n = 3) {
  const out = [];
  let iso = p.start_date > state.today ? p.start_date : state.today;
  for (let i = 0; i < 400 && out.length < n; i++, iso = addDays(iso, 1)) {
    if (weekday(iso) < 5 && planMatches(p, iso)) out.push(formatShort(iso));
  }
  return out;
}

const isCurrent = (p) => (p.kind === 'recurring' ? !p.end_date || p.end_date >= state.today : (p.end_date || p.start_date) >= state.today);

function renderPlan() {
  const editing = state.data.plans.find((p) => p.id === state.editPlanId);
  const f = editing || {
    member_id: me()?.id,
    kind: 'absence',
    status: 'away',
    note: '',
    start_date: state.today,
    end_date: state.today,
    repeat: 'weekly',
    weekday: 4,
    interval: 1,
    nth: 1,
  };
  const opt = (v, cur, label) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;

  $('#plan-form').innerHTML = `
    <h2>${editing ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</h2>
    <div class="seg" role="radiogroup" aria-label="Person">
      ${state.data.members.map((p) => `<label><input type="radio" name="member" value="${p.id}"${p.id === f.member_id ? ' checked' : ''} required><span>${esc(p.name)}</span></label>`).join('')}
    </div>
    <div class="seg" role="radiogroup" aria-label="Art">
      ${Object.entries(KIND_LABEL).map(([k, l]) => `<label><input type="radio" name="kind" value="${k}"${k === f.kind ? ' checked' : ''}><span>${l}</span></label>`).join('')}
    </div>
    <div class="grid">
      <label>Status<select name="status" data-cur="${f.status}"></select></label>
      <label>Tageszeit<select name="half">${opt('', f.half || '', 'ganzer Tag')}${opt('am', f.half || '', 'nur vormittags')}${opt('pm', f.half || '', 'nur nachmittags')}</select></label>
      <label><span class="lbl-start">Von</span><input type="date" name="start_date" value="${f.start_date}" required></label>
      <label class="k-absence">Bis<input type="date" name="end_date" value="${f.end_date || f.start_date}"></label>
      <label class="k-recurring">Wiederholung<select name="repeat">${opt('weekly', f.repeat, 'wöchentlich')}${opt('monthly_nth', f.repeat, 'monatlich (n-ter Wochentag)')}</select></label>
      <label class="k-recurring">Wochentag<select name="weekday">${[0, 1, 2, 3, 4].map((d) => opt(d, f.weekday, WEEKDAYS_LONG[d])).join('')}</select></label>
      <label class="k-recurring r-weekly">Rhythmus<select name="interval">${[1, 2, 3, 4].map((n) => opt(n, f.interval, n === 1 ? 'jede Woche' : `alle ${n} Wochen`)).join('')}</select></label>
      <label class="k-recurring r-monthly">Welcher<select name="nth">${[1, 2, 3, 4, -1].map((n) => opt(n, f.nth, NTH_LABEL[n])).join('')}</select></label>
      <label class="k-recurring">Endet am (optional)<input type="date" name="rec_end" value="${f.kind === 'recurring' ? f.end_date || '' : ''}"></label>
      <label class="wide">Notiz<input name="note" maxlength="60" value="${esc(f.note)}" placeholder="z. B. Urlaub, Fortbildung, Homeoffice"></label>
    </div>
    <div class="actions">
      ${editing ? '<button type="button" class="btn ghost" data-cancel-edit>Abbrechen</button>' : ''}
      <button class="btn primary" type="submit">${editing ? 'Speichern' : 'Eintragen'}</button>
    </div>`;
  syncPlanForm();

  const sorted = [...state.data.plans].sort(
    (a, b) => (a.kind === 'recurring') - (b.kind === 'recurring') || a.start_date.localeCompare(b.start_date),
  );
  let filter = LS.get('552.planFilter', 'all');
  if (filter !== 'all' && !member(filter)) filter = 'all';
  $('#plan-filter').innerHTML = [['all', 'Alle'], ...state.data.members.map((p) => [p.id, p.name])]
    .map(([v, l]) => `<button data-filter="${v}" aria-pressed="${filter === v}">${esc(l)}</button>`)
    .join('');
  const visible = sorted.filter((p) => (filter === 'all' || p.member_id === filter) && isCurrent(p));
  const past = sorted.filter((p) => !isCurrent(p)).length;
  $('#plan-list').innerHTML =
    (visible.length
      ? visible
          .map((p) => {
            const next = p.kind === 'recurring' ? nextDates(p) : [];
            return `<li class="plan-item" style="--c:${STATUSES[p.status].color}">
              <div class="plan-main">
                <span class="plan-who">${esc(member(p.member_id)?.name || '?')}</span>
                <span class="plan-kind">${KIND_LABEL[p.kind]}${p.note ? ` · ${esc(p.note)}` : ''}</span>
                <span class="plan-when">${esc(describePlan(p))}</span>
                ${next.length ? `<span class="plan-next">Nächste: ${next.join(', ')}</span>` : ''}
              </div>
              <div class="plan-actions">
                <button type="button" class="btn small ghost" data-edit="${p.id}">Bearbeiten</button>
                <button type="button" class="btn small ghost danger" data-delete="${p.id}">Löschen</button>
              </div>
            </li>`;
          })
          .join('')
      : '<li class="empty">Keine aktuellen Einträge.</li>') + (past ? `<li class="empty">${past} vergangene Einträge ausgeblendet.</li>` : '');
}

function syncPlanForm() {
  const form = $('#plan-form');
  const sel = form.status;
  const cur = sel.value || sel.dataset.cur || 'away';
  const mid = form.member.value;
  const list = ['away', 'mobile', 'office', ...(extraAllowed(mid) ? ['kreditnext'] : [])];
  sel.innerHTML = list.map((s) => `<option value="${s}"${s === cur ? ' selected' : ''}>${esc(STATUSES[s].label)}</option>`).join('');
  const kind = form.kind.value;
  const repeat = form.repeat.value;
  form.querySelectorAll('.k-absence, .k-recurring').forEach((el) => {
    el.hidden = !el.classList.contains(`k-${kind}`);
  });
  form.querySelectorAll('.r-weekly').forEach((el) => (el.hidden = kind !== 'recurring' || repeat !== 'weekly'));
  form.querySelectorAll('.r-monthly').forEach((el) => (el.hidden = kind !== 'recurring' || repeat !== 'monthly_nth'));
  $('.lbl-start', form).textContent = kind === 'recurring' ? 'Gilt ab' : kind === 'single' ? 'Datum' : 'Von';
}

function readPlanForm() {
  const form = $('#plan-form');
  const kind = form.kind.value;
  const plan = {
    member_id: form.member.value,
    kind,
    status: form.status.value,
    note: form.note.value.trim().slice(0, 60),
    half: form.half.value || null,
    start_date: form.start_date.value,
    end_date: null,
    repeat: null,
    weekday: null,
    interval: 1,
    nth: null,
  };
  if (kind === 'absence') plan.end_date = form.end_date.value;
  if (kind === 'recurring') {
    plan.repeat = form.repeat.value;
    plan.weekday = Number(form.weekday.value);
    if (plan.repeat === 'weekly') plan.interval = Number(form.interval.value);
    else plan.nth = Number(form.nth.value);
    plan.end_date = form.rec_end.value || null;
  }
  if (state.editPlanId) plan.id = state.editPlanId;
  return plan;
}

// ---------- sheets ----------
function openSheet(html, onMount) {
  const dlg = $('#sheet');
  state.onSheetClose = null;
  $('#sheet-body').innerHTML = html;
  state.sheetOpen = true;
  openDialog(dlg);
  onMount?.($('#sheet-body'));
}
function closeSheet() {
  const dlg = $('#sheet');
  if (dlg.open) dlg.close();
}

function guestSection(deskId, iso, ownerBusy, ownerName) {
  const guest = guestFor(deskId, iso);
  if (guest) {
    return `<p>Reserviert für <strong>${esc(guest.guest_name)}</strong>${guest.booked_by ? ` (von ${esc(guest.booked_by)})` : ''}.</p>
      ${ownerBusy ? `<p class="warn">Achtung: ${esc(ownerName)} ist an diesem Tag selbst im Büro.</p>` : ''}
      <button type="button" class="btn ghost danger" data-guest-clear>Reservierung aufheben</button>`;
  }
  if (ownerBusy) return `<p class="muted">${esc(ownerName)} sitzt an diesem Tag selbst hier. Ein Gast kann reserviert werden, wenn der Tisch frei ist.</p>`;
  return `<form class="guest-form" data-guest-form>
      <label>Tisch für einen Gast reservieren<input name="guest" maxlength="40" placeholder="Name des Gasts" required></label>
      <button class="btn" type="submit">Reservieren</button>
    </form>`;
}

function bindGuest(root, deskId, iso) {
  root.querySelector('[data-guest-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.guest.value.trim();
    if (!name) return;
    closeSheet();
    mutate(() => db.setGuest(room(), { date: iso, desk: deskId, guest_name: name.slice(0, 40), booked_by: me()?.name || '' }), 'Gastplatz reserviert');
  });
  root.querySelector('[data-guest-clear]')?.addEventListener('click', () => {
    closeSheet();
    mutate(() => db.clearGuest(room(), iso, deskId));
  });
}

function openDesk(deskId) {
  const desk = DESKS.find((d) => d.id === deskId);
  const owner = deskOwner(deskId);
  if (!owner) {
    const iso = state.selected;
    openSheet(
      `<header class="sheet-head"><h2>Freier Tisch <small>· ${esc(desk.label)}</small></h2>
        <p>${WEEKDAYS_LONG[weekday(iso)]}, ${formatShort(iso)}${iso.slice(0, 4)}</p></header>
       <section class="guest-box first"><h3>Gastplatz</h3>${guestSection(deskId, iso, false, '')}</section>
       <p class="muted small">Einen festen Platz vergibst du unter Einstellungen → Mitglieder.</p>`,
      (root) => bindGuest(root, deskId, iso),
    );
    return;
  }
  openPerson(owner.id, deskId);
}

function openPerson(mid, deskId = null) {
  const p = member(mid);
  const desk = DESKS.find((d) => d.id === (deskId || p.desk));
  const iso = state.selected;
  const info = dayInfo(mid, iso);
  const ov = state.data.overrides.find((o) => o.member_id === mid && o.date === iso);
  const base = info.base;
  const baseText =
    base.source === 'plan' || base.source === 'turnus'
      ? `Laut Planung: ${esc(statusText(base))}${base.note ? ` (${esc(base.note)})` : ''}`
      : base.source === 'holiday'
        ? `Feiertag: ${esc(base.note)}`
        : 'Kein Planeintrag';

  // Changes are collected here and saved together: with "Speichern" or when the sheet is closed in any way.
  // am = morning or whole day, pm = afternoon (only used while the day is split)
  const pending = { am: ov?.status ?? null, pm: ov?.status_pm ?? null, split: info.split, note: ov?.note ?? '' };
  let skipSave = false;
  const shownAm = () => pending.am ?? info.status;
  const shownPm = () => pending.pm ?? (pending.am && !info.split ? pending.am : info.statusPm);
  const buttons = (row) =>
    statusesFor(mid)
      .map(
        (s) => `<button type="button" role="radio" data-row="${row}" data-status="${s}" style="--c:${STATUSES[s].color}">
          <i class="dot big" ${stAttr(s)}></i>${esc(STATUSES[s].label)}</button>`,
      )
      .join('');

  openSheet(
    `<header class="sheet-head">
      <h2>${esc(p.name)} <small>${desk ? `· Tisch ${esc(desk.label)}` : '· ohne festen Tisch'}</small></h2>
      <p>${WEEKDAYS_LONG[weekday(iso)]}, ${formatShort(iso)}${iso.slice(0, 4)}</p>
    </header>
    <div class="day-halves">
      <p class="half-head" data-am-head>Vormittag</p>
      <div class="status-pick" role="radiogroup" aria-label="Status">${buttons('am')}</div>
      <div class="pm-wrap" data-pm-wrap>
        <p class="half-head">Nachmittag</p>
        <div class="status-pick" role="radiogroup" aria-label="Status am Nachmittag">${buttons('pm')}</div>
      </div>
      <button type="button" class="link-btn" data-split-toggle></button>
    </div>
    <form class="note-only" data-note-form>
      <label>Notiz für diesen Tag<input name="note" maxlength="60" value="${esc(ov?.note ?? '')}" placeholder="${esc(base.note || 'z. B. ab 11 Uhr da')}" enterkeyhint="done"></label>
    </form>
    <p class="base-info">${baseText}${ov ? ' · <strong>für diesen Tag geändert</strong>' : ''}</p>
    ${ov ? '<button type="button" class="btn ghost small" data-reset>Auf Planung zurücksetzen</button>' : ''}
    ${desk ? `<section class="guest-box guest-section"><h3>Gastplatz</h3>${guestSection(desk.id, iso, inOffice(info), p.name)}</section>` : ''}
    <div class="actions"><button type="button" class="btn primary wide-btn" data-save-person>Speichern</button></div>`,
    (root) => {
      const sync = () => {
        root.querySelectorAll('[data-row="am"]').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.status === shownAm())));
        root.querySelectorAll('[data-row="pm"]').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.status === shownPm())));
        root.querySelector('[data-pm-wrap]').hidden = !pending.split;
        root.querySelector('[data-am-head]').hidden = !pending.split;
        root.querySelector('[data-split-toggle]').textContent = pending.split ? 'Ganzer Tag gleich' : 'Nachmittags anders …';
      };
      root.querySelectorAll('[data-status]').forEach((b) =>
        b.addEventListener('click', () => {
          const s = b.dataset.status;
          if (b.dataset.row === 'am') {
            pending.am = s;
            if (!pending.split) pending.pm = null;
          } else if (s === shownAm()) {
            // afternoon like the morning -> back to one status for the whole day
            pending.split = false;
            pending.pm = null;
            if (!pending.am) pending.am = s;
          } else {
            pending.pm = s;
          }
          sync();
        }),
      );
      root.querySelector('[data-split-toggle]').addEventListener('click', () => {
        pending.split = !pending.split;
        if (!pending.split) {
          pending.pm = null;
          if (!pending.am) pending.am = shownAm();
        }
        sync();
      });
      sync();
      const noteInput = root.querySelector('[data-note-form] input');
      noteInput.addEventListener('input', () => (pending.note = noteInput.value));
      root.querySelector('[data-note-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        closeSheet();
      });
      root.querySelector('[data-save-person]').addEventListener('click', closeSheet);
      root.querySelector('[data-reset]')?.addEventListener('click', () => {
        skipSave = true;
        closeSheet();
        mutate(() => db.clearOverride(room(), mid, iso), 'Auf Planung zurückgesetzt');
      });
      if (desk) bindGuest(root, desk.id, iso);

      state.onSheetClose = () => {
        if (skipSave) return;
        const note = pending.note.trim().slice(0, 60);
        const am = pending.am;
        // the afternoon is stored only while the day is split and something was chosen
        let pm = pending.split && (pending.pm || pending.am) ? shownPm() : null;
        if (pm && pm === (am ?? info.status)) pm = null;
        const changed = am !== (ov?.status ?? null) || pm !== (ov?.status_pm ?? null) || note !== (ov?.note ?? '').trim();
        if (!changed) return;
        if (!am && !pm && !note) {
          if (ov) mutate(() => db.clearOverride(room(), mid, iso), 'Gespeichert');
          return;
        }
        mutate(() => db.setOverride(room(), { member_id: mid, date: iso, status: am, status_pm: pm, note: note || null }), 'Gespeichert');
      };
    },
  );
}

function openNoteEditor() {
  openSheet(
    `<header class="sheet-head"><h2>Pinnwand</h2><p>Notiz fürs ganze Zimmer</p></header>
    <form data-board-form class="stack">
      <label>Überschrift<input name="title" maxlength="40" required placeholder="z. B. Drucker leer"></label>
      <label>Text (optional)<textarea name="text" maxlength="1000" rows="5" placeholder="Details, z. B. wer sich kümmert"></textarea></label>
      <div class="seg colors" role="radiogroup" aria-label="Farbe">
        ${Object.entries(NOTE_COLORS)
          .map(([k, c], i) => `<label><input type="radio" name="color" value="${k}"${i === 0 ? ' checked' : ''}><span style="background:${c}" aria-label="${k}"></span></label>`)
          .join('')}
      </div>
      <button class="btn primary" type="submit">Anheften</button>
    </form>`,
    (root) => {
      root.querySelector('input[name=title]').focus();
      root.querySelector('[data-board-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = e.target.title.value.trim().slice(0, 40);
        const text = e.target.text.value.trim().slice(0, 1000);
        if (!title) return;
        const color = e.target.color.value;
        closeSheet();
        mutate(() => db.addNote(room(), { title, text, color, author_id: me()?.id || null, author_name: me()?.name || '' })).then((ok) => ok && notifyPush('note'));
      });
    },
  );
}

function openNote(id) {
  const n = state.data.board.find((x) => x.id === id);
  if (!n) return;
  const when = new Date(n.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const body = (n.title || '').trim() ? n.text : (n.text || '').split('\n').slice(1).join('\n');
  openSheet(
    `<article class="note-big" style="--note:${NOTE_COLORS[n.color] || NOTE_COLORS.yellow}">
      <h2>${esc(noteTitle(n))}</h2>
      ${(body || '').trim() ? `<p class="note-body">${esc(body.trim())}</p>` : ''}
      <p class="note-meta">${esc(n.author_name || 'unbekannt')} · ${esc(when)}</p>
    </article>
    <div class="actions"><button type="button" class="btn ghost" data-close>Schließen</button><button type="button" class="btn primary" data-done>Erledigt – abnehmen</button></div>`,
    (root) => {
      root.querySelector('[data-close]').addEventListener('click', closeSheet);
      root.querySelector('[data-done]').addEventListener('click', () => {
        closeSheet();
        mutate(() => db.deleteNote(room(), id));
      });
    },
  );
}

function deskSelect(name, current, ownerId) {
  const taken = (deskId) => state.data.members.find((m) => m.desk === deskId && m.id !== ownerId);
  return `<select name="${name}">
    <option value="">kein fester Tisch</option>
    ${DESKS.map((d) => {
      const t = taken(d.id);
      return `<option value="${d.id}"${d.id === current ? ' selected' : ''}>${d.label}${t ? ` (jetzt ${esc(t.name)})` : ''}</option>`;
    }).join('')}
  </select>`;
}

function openSettings() {
  const m = me();
  openSheet(
    `<header class="sheet-head"><h2>Einstellungen</h2><p>Raum <strong>${esc(room())}</strong> · angemeldet als <strong>${esc(m?.name)}</strong></p></header>
    <div class="actions left">
      <button type="button" class="btn" data-share>Raumcode teilen</button>
      <button type="button" class="btn ghost" data-switch>Ich bin jemand anderes</button>
    </div>
    <section class="guest-box" id="push-box"></section>
    <section class="guest-box">
      <h3>Mitglieder</h3>
      <p class="muted small">Name und fester Tisch. Ein Tisch kann nur einer Person gehören.</p>
      <div class="members">
        ${state.data.members
          .map(
            (x) => `<form class="member-row" data-member-form="${x.id}">
              <input name="name" value="${esc(x.name)}" maxlength="20" required aria-label="Name">
              ${deskSelect('desk', x.desk, x.id)}
              <button class="btn small" type="submit">Speichern</button>
              ${x.id === m?.id ? '' : `<button type="button" class="btn small ghost danger" data-member-delete="${x.id}" aria-label="${esc(x.name)} entfernen">✕</button>`}
            </form>`,
          )
          .join('')}
        <form class="member-row" data-member-add>
          <input name="name" maxlength="20" placeholder="Neue Person" required aria-label="Name">
          ${deskSelect('desk', '', null)}
          <button class="btn small primary" type="submit">Hinzufügen</button>
        </form>
      </div>
    </section>
    <div class="actions">
      ${isDemo ? '<button type="button" class="btn ghost danger" data-demo-off>Demo beenden</button>' : '<button type="button" class="btn ghost danger" data-leave>Raum verlassen</button>'}
      <button type="button" class="btn primary" data-close>Fertig</button>
    </div>
    <p class="muted small version">Version ${esc(window.__VER || '–')}</p>`,
    (root) => {
      renderPushBox(root.querySelector('#push-box'));
      state.onSheetClose = () => renderPushHint(true);
      root.querySelector('[data-close]').addEventListener('click', closeSheet);
      root.querySelector('[data-share]').addEventListener('click', shareRoom);
      root.querySelector('[data-switch]').addEventListener('click', () => {
        closeSheet();
        showSetup('who');
      });
      root.querySelectorAll('[data-member-form]').forEach((f) =>
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const id = f.dataset.memberForm;
          const name = f.name.value.trim().slice(0, 20);
          const desk = f.desk.value || null;
          if (!name) return;
          mutate(async () => {
            const holder = desk && state.data.members.find((x) => x.desk === desk && x.id !== id);
            if (holder) await db.updateMember(room(), holder.id, { desk: null });
            await db.updateMember(room(), id, { name, desk });
          }, 'Gespeichert').then(() => state.sheetOpen && openSettings());
        }),
      );
      root.querySelector('[data-member-add]').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.target.name.value.trim().slice(0, 20);
        const desk = e.target.desk.value || null;
        if (!name) return;
        mutate(async () => {
          const holder = desk && state.data.members.find((x) => x.desk === desk);
          if (holder) await db.updateMember(room(), holder.id, { desk: null });
          await db.addMember(room(), { id: newMemberId(), name, desk });
        }, `${name} hinzugefügt`).then(() => state.sheetOpen && openSettings());
      });
      root.querySelectorAll('[data-member-delete]').forEach((b) =>
        b.addEventListener('click', () => {
          const x = member(b.dataset.memberDelete);
          if (!confirm(`${x.name} aus dem Raum entfernen? Alle Planungen und Tageseinträge dieser Person werden gelöscht.`)) return;
          mutate(() => db.deleteMember(room(), x.id), 'Entfernt').then(() => state.sheetOpen && openSettings());
        }),
      );
      root.querySelector('[data-leave]')?.addEventListener('click', () => {
        if (!confirm('Raum auf diesem Gerät verlassen? Die Daten im Raum bleiben erhalten.')) return;
        leaveRoom();
      });
      root.querySelector('[data-demo-off]')?.addEventListener('click', () => {
        LS.set('552.demo', null);
        LS.set('552.demoDb', null);
        LS.set('552.session', null);
        location.href = location.pathname;
      });
    },
  );
}

async function shareRoom() {
  const text = `Unser Büro in 552 – Raumcode: ${room()}`;
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ title: '552', text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Raumcode kopiert');
  } catch {
    toast(`Raumcode: ${room()}`);
  }
}

function leaveRoom() {
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.session = null;
  saveSession();
  state.data = { members: [], plans: [], overrides: [], guests: [], board: [], dogs: [] };
  closeSheet();
  showSetup('room');
}

// ---------- setup: room + who am I ----------
function showSetup(step, message = '') {
  closeSheet();
  document.body.dataset.setup = step;
  const el = $('#setup-card');
  if (step === 'room') {
    el.innerHTML = `
      <img src="icon-192.png" class="brand-logo big" alt="552" width="84" height="84">
      <h1>Unser Büro</h1>
      <p class="muted">Wer ist heute im Zimmer? Tritt eurem Raum mit dem Raumcode bei.</p>
      <form data-join class="stack">
        <label>Raumcode<input name="code" placeholder="z. B. BUERO-5521" autocapitalize="characters" autocomplete="off" required style="text-transform:uppercase"></label>
        <button class="btn primary" type="submit">Beitreten</button>
      </form>
      <div class="divider">oder</div>
      <button type="button" class="btn" data-create>Neuen Raum erstellen</button>
      ${isDemo ? '' : '<button type="button" class="btn ghost small" data-demo>Erst mal ohne Daten ausprobieren (Demo)</button>'}
      <p class="err" ${message ? '' : 'hidden'}>${esc(message)}</p>`;
    el.querySelector('[data-join]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = e.target.code.value.trim().toUpperCase();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Suche …';
      try {
        const found = await db.findRoom(code);
        if (!found) return showSetup('room', `Raum „${code}“ wurde nicht gefunden.`);
        state.session = { room: code, memberId: null };
        saveSession();
        await enterRoom();
      } catch (err) {
        showSetup('room', err.message || 'Die Datenbank ist gerade nicht erreichbar.');
      }
    });
    el.querySelector('[data-create]').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        let code = newRoomCode();
        for (let i = 0; i < 5 && (await db.findRoom(code)); i++) code = newRoomCode();
        await db.createRoom(code, 'Zimmer 552');
        state.session = { room: code, memberId: null };
        saveSession();
        await enterRoom();
      } catch (err) {
        showSetup('room', err.message || 'Raum konnte nicht angelegt werden.');
      }
    });
    el.querySelector('[data-demo]')?.addEventListener('click', () => {
      location.href = location.pathname + '?demo';
    });
    return;
  }

  // step 'who'
  const members = state.data.members;
  el.innerHTML = `
    <img src="icon-192.png" class="brand-logo big" alt="552" width="84" height="84">
    <h1>Wer bist du?</h1>
    <p class="muted">Raum <strong>${esc(room())}</strong>. Einmal auswählen – das Gerät merkt es sich, z. B. für Pinnwand-Einträge.</p>
    <div class="who">
      ${members
        .map((m) => {
          const desk = DESKS.find((d) => d.id === m.desk);
          return `<button type="button" class="who-btn" data-pick-me="${m.id}"><strong>${esc(m.name)}</strong><span>${desk ? `Tisch ${desk.label}` : 'ohne festen Tisch'}</span></button>`;
        })
        .join('')}
    </div>
    <details class="new-me">
      <summary>Ich bin neu hier</summary>
      <form data-new-me class="stack">
        <label>Dein Name<input name="name" maxlength="20" required placeholder="z. B. Mia"></label>
        <label>Fester Tisch${deskSelect('desk', '', null)}</label>
        <button class="btn primary" type="submit">Anlegen und los</button>
      </form>
    </details>
    <button type="button" class="btn ghost small" data-other-room>Anderer Raum</button>
    <p class="err" ${message ? '' : 'hidden'}>${esc(message)}</p>`;
  el.querySelectorAll('[data-pick-me]').forEach((b) =>
    b.addEventListener('click', () => {
      state.session.memberId = b.dataset.pickMe;
      saveSession();
      finishSetup();
    }),
  );
  el.querySelector('[data-new-me]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim().slice(0, 20);
    if (!name) return;
    if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return showSetup('who', `„${name}“ gibt es schon – bitte oben auswählen.`);
    }
    const desk = e.target.desk.value || null;
    const id = newMemberId();
    try {
      const holder = desk && members.find((x) => x.desk === desk);
      if (holder) await db.updateMember(room(), holder.id, { desk: null });
      await db.addMember(room(), { id, name, desk });
      state.session.memberId = id;
      saveSession();
      await load();
      finishSetup();
    } catch (err) {
      showSetup('who', err.message);
    }
  });
  el.querySelector('[data-other-room]').addEventListener('click', leaveRoom);
}

function finishSetup() {
  delete document.body.dataset.setup;
  toast(`Hallo ${me()?.name || ''}!`);
  render();
  maybeShowStartStoerer();
}

async function enterRoom() {
  state.unsubscribe?.();
  try {
    state.data = await db.load(room(), state.weekStart, addDays(state.weekStart, 6));
  } catch (err) {
    $('#dbbanner').hidden = false;
    return;
  }
  await loadConfig();
  state.unsubscribe = db.subscribe(room(), (table) => {
    if (table === 'z552_roomconfig' || table === 'demo') loadConfig().then(() => me() && render());
    if (table !== 'z552_roomconfig') scheduleReload();
  });
  if (!me()) return showSetup('who', state.session.memberId ? 'Du bist in diesem Raum nicht mehr eingetragen. Bitte neu auswählen.' : '');
  delete document.body.dataset.setup;
  render();
  maybeShowStartStoerer();
}

// ---------- room settings (developer menu) ----------
const SPRUECHE_DEFAULT = ['Absolute Bubensahne', 'Wohlverdient!', 'Geil gemacht!', 'Ab in die Sonne!', 'Na endlich!'];
const CFG_DEFAULT = {
  pin: '0552',
  kreditnext: { on: true, label: 'KreditNext', members: [] }, // members [] = everyone named Julia
  quotes: { offset: 0, hidden: [] }, // quote of the day: skipped steps and quotes hidden for good
  push: { on: true, url: '', morning: true, morningTime: '08:30', notes: true, dogs: true },
  whatsapp: '', // invite link of the group chat, e.g. https://chat.whatsapp.com/AbC123
  theme: 'auto', // auto | light | dark
  features: { board: true, guests: true, overview: true, bridge: true, dogs: false, quotes: true },
  start: { on: false, title: 'Guten Morgen, Zimmer 552!', btn: "Los geht's", img: '', imgPath: '', freq: 'daily', from: '', to: '' },
  vac: { on: false, title: 'Urlaub ist eingetragen!', btn: 'Geil!', img: '', imgPath: '', random: false, sprueche: SPRUECHE_DEFAULT.slice(), konfetti: true },
};
const clone = (x) => JSON.parse(JSON.stringify(x));
function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') out[k] = deepMerge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}
state.cfg = clone(CFG_DEFAULT);

function cachedConfig() {
  try {
    return JSON.parse(LS.get('552.cfg', 'null'));
  } catch {
    return null;
  }
}
async function loadConfig() {
  if (!room()) return;
  try {
    const c = await db.getConfig(room());
    state.cfg = deepMerge(CFG_DEFAULT, c || {});
    LS.set('552.cfg', JSON.stringify(state.cfg));
  } catch {
    /* keep current config */
  }
  applyConfig();
}
function applyConfig() {
  const c = state.cfg;
  STATUSES.kreditnext.label = (c.kreditnext?.label || 'KreditNext').slice(0, 20);
  if (c.theme === 'light' || c.theme === 'dark') document.documentElement.dataset.theme = c.theme;
  else delete document.documentElement.dataset.theme;
  const dark = c.theme === 'dark' || (c.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#17191c' : '#f3f1ec';
  document.body.classList.toggle('no-board', !c.features.board);
  document.body.classList.toggle('no-overview', !c.features.overview);
  document.body.classList.toggle('no-bridge', !c.features.bridge);
  document.body.classList.toggle('no-guests', !c.features.guests);
  if (document.getElementById('basket')) renderBasket();
  const wa = $('#wa-link');
  const okLink = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(c.whatsapp || '');
  wa.hidden = !okLink;
  if (okLink) wa.href = c.whatsapp;
}
const feature = (name) => state.cfg.features[name] !== false;

// secret access: tap the app icon 5 times
let devTaps = 0;
let devTimer = null;
function onLogoTap() {
  devTaps++;
  clearTimeout(devTimer);
  devTimer = setTimeout(() => (devTaps = 0), 1500);
  if (devTaps >= 5) {
    devTaps = 0;
    askDevPin();
  }
}
function askDevPin() {
  openSheet(
    `<header class="sheet-head"><h2>Entwicklermenü</h2><p>Bitte PIN eingeben</p></header>
     <form data-pin class="stack">
       <input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" required aria-label="PIN" class="pin-input">
       <p class="err" hidden>Falsche PIN</p>
       <button class="btn primary" type="submit">Öffnen</button>
     </form>`,
    (root) => {
      const f = root.querySelector('[data-pin]');
      f.pin.focus();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        if (f.pin.value === String(state.cfg.pin)) openDev();
        else {
          root.querySelector('.err').hidden = false;
          f.pin.select();
        }
      });
    },
  );
}

let DRAFT = null;
const check = (id, on, text) => `<label class="chk"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${text}</label>`;
const imgPreview = (src) => src || 'icon-512.png';

// developer menu: skip or hide the quote of the day (saved immediately, for everyone)
function devQuoteHtml() {
  const z = quoteOfDay(state.today);
  const hiddenCount = (state.cfg.quotes?.hidden || []).length;
  const text = z ? z.lines.map((l) => (z.lines.length > 1 ? `${l.who.split(' ')[0]}: ` : '') + l.text).join(' / ') : 'Keine Zitate mehr übrig.';
  const who = z ? (z.lines.length === 1 ? z.lines[0].who : [...new Set(z.lines.map((l) => l.who))].join(' & ')) : '';
  return `<h3>Zitat des Tages</h3>
    <blockquote class="dev-quote">${esc(text)}${who ? `<br><em>${esc(who)} – ${esc(z.source)}</em>` : ''}</blockquote>
    <div class="actions left">
      <button type="button" class="btn small" data-quote-next ${z ? '' : 'disabled'}>Nächstes Zitat</button>
      <button type="button" class="btn small ghost danger" data-quote-hide ${z ? '' : 'disabled'}>Nie wieder zeigen</button>
      ${hiddenCount ? `<button type="button" class="btn small ghost" data-quote-unhide>Alle ${hiddenCount} ausgeblendeten wieder einblenden</button>` : ''}
    </div>
    <p class="muted small">Gilt sofort für alle im Raum. ${activeQuotes().length} von ${ZITATE.length} Zitaten aktiv.</p>`;
}
function bindDevQuote(root) {
  const sec = root.querySelector('#dev-quote');
  const save = async (change, msg) => {
    const quotes = { offset: 0, hidden: [], ...(state.cfg.quotes || {}) };
    change(quotes);
    const next = { ...state.cfg, quotes };
    try {
      await db.saveConfig(room(), next);
      state.cfg = deepMerge(CFG_DEFAULT, next);
      if (DRAFT) DRAFT.quotes = clone(quotes);
      LS.set('552.cfg', JSON.stringify(state.cfg));
      LS.set('552.quoteClosed', null); // show the new quote again on this device
      renderQuote();
      sec.innerHTML = devQuoteHtml();
      bindDevQuote(root);
      toast(msg);
    } catch (err) {
      toast('Nicht gespeichert: ' + err.message);
    }
  };
  sec.querySelector('[data-quote-next]')?.addEventListener('click', () => save((q) => (q.offset = (Number(q.offset) || 0) + 1), 'Nächstes Zitat'));
  sec.querySelector('[data-quote-hide]')?.addEventListener('click', () => {
    const z = quoteOfDay(state.today);
    if (z) save((q) => (q.hidden = [...new Set([...(q.hidden || []), quoteId(z)])]), 'Zitat ausgeblendet');
  });
  sec.querySelector('[data-quote-unhide]')?.addEventListener('click', () => save((q) => (q.hidden = []), 'Alle Zitate wieder aktiv'));
}

function openDev() {
  DRAFT = clone(state.cfg);
  renderDev();
}
function renderDev() {
  const d = DRAFT;
  const sel = (id, cur, opts) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const stoerer = (key, label, extra) => `
    <section class="dev-sec">
      <h3>${label}</h3>
      ${check(`d_${key}_on`, d[key].on, 'Aktiv')}
      <label>Überschrift<textarea id="d_${key}_title" rows="2">${esc(d[key].title)}</textarea></label>
      <label>Button-Text<input id="d_${key}_btn" value="${esc(d[key].btn)}" maxlength="30"></label>
      <div class="dev-img">
        <img id="d_${key}_prev" src="${esc(imgPreview(d[key].img))}" alt="">
        <div>
          <label class="btn small">Bild oder GIF wählen<input type="file" accept="image/*,.gif" data-upload="${key}" hidden></label>
          ${d[key].img ? `<button type="button" class="btn small ghost danger" data-clear-img="${key}">Bild entfernen</button>` : '<p class="muted small">Ohne Bild wird das App-Icon gezeigt.</p>'}
        </div>
      </div>
      ${extra}
      <button type="button" class="btn small ghost" data-preview="${key}">Vorschau</button>
    </section>`;

  openSheet(
    `<header class="sheet-head"><h2>Entwicklermenü</h2><p>Gilt für alle im Raum <strong>${esc(room())}</strong></p></header>
    <div class="dev">
      <section class="dev-sec" id="dev-quote">${devQuoteHtml()}</section>
      <section class="dev-sec" id="dev-push">${devPushHtml(d)}</section>
      ${stoerer(
        'start',
        'Start-Störer',
        `<div class="grid">
          <label>Wie oft${sel('d_start_freq', d.start.freq, [
            ['daily', 'einmal pro Tag'],
            ['always', 'bei jedem Öffnen'],
            ['once', 'nur einmal (bis zur nächsten Änderung)'],
          ])}</label>
          <label>Zeigen ab (optional)<input type="date" id="d_start_from" value="${esc(d.start.from)}"></label>
          <label>Zeigen bis (optional)<input type="date" id="d_start_to" value="${esc(d.start.to)}"></label>
        </div>`,
      )}
      ${stoerer(
        'vac',
        'Urlaubs-Störer (nach dem Eintragen von Urlaub)',
        `${check('d_vac_random', d.vac.random, 'Zufälligen Spruch statt fester Überschrift')}
         <div id="d_sprueche" class="dev-list">${d.vac.sprueche
           .map((s, i) => `<div class="dev-row"><input value="${esc(s)}" data-spruch="${i}" maxlength="60"><button type="button" class="btn small ghost danger" data-del-spruch="${i}">✕</button></div>`)
           .join('')}<button type="button" class="btn small" data-add-spruch>Spruch hinzufügen</button></div>
         ${check('d_vac_konfetti', d.vac.konfetti, 'Konfetti')}`,
      )}
      <section class="dev-sec">
        <h3>Darstellung & Funktionen</h3>
        <label>Design${sel('d_theme', d.theme, [
          ['auto', 'wie das Gerät'],
          ['light', 'immer hell'],
          ['dark', 'immer dunkel'],
        ])}</label>
        ${check('d_f_board', d.features.board, 'Pinnwand')}
        ${check('d_f_guests', d.features.guests, 'Gastplatz')}
        ${check('d_f_overview', d.features.overview, 'Wochenüberblick')}
        ${check('d_f_bridge', d.features.bridge, 'Brückentag-Hinweise')}
        ${check('d_f_dogs', d.features.dogs, 'Hundekörbchen neben Julia (Hazel & Koko)')}
        ${check('d_f_quotes', d.features.quotes, 'Zitat des Tages (Stromberg & The Office)')}
      </section>
      <section class="dev-sec">
        <h3>Zusatz-Status (Tisch grün/rot gestreift)</h3>
        ${check('d_kn_on', d.kreditnext.on, 'Aktiv')}
        <label>Bezeichnung<input id="d_kn_label" value="${esc(d.kreditnext.label)}" maxlength="20"></label>
        <div class="dev-list"><span class="muted small">Auswählbar für:</span>
          ${state.data.members
            .map((m) => {
              const on = d.kreditnext.members?.length ? d.kreditnext.members.includes(m.id) : m.name.trim().toLowerCase() === 'julia';
              return check(`d_kn_m_${m.id}`, on, esc(m.name)).replace('<input ', `<input data-kn-member="${m.id}" `);
            })
            .join('')}
        </div>
      </section>
      <section class="dev-sec">
        <h3>WhatsApp-Gruppe</h3>
        <label>Einladungslink der Gruppe<input id="d_whatsapp" value="${esc(d.whatsapp)}" placeholder="https://chat.whatsapp.com/…" inputmode="url" autocomplete="off"></label>
        <p class="muted small">In WhatsApp: Gruppe öffnen → Gruppenname antippen → „Per Link einladen“ → Link kopieren. Ist ein Link eingetragen, erscheint oben in der App ein WhatsApp-Knopf.</p>
      </section>
      <section class="dev-sec">
        <h3>Zugang</h3>
        <label>PIN für dieses Menü<input id="d_pin" value="${esc(d.pin)}" maxlength="12" inputmode="numeric"></label>
      </section>
      <section class="dev-sec">
        <h3>Wartung</h3>
        <div class="actions left">
          <button type="button" class="btn small" data-log>Logbuch (90 Tage)</button>
          <button type="button" class="btn small" data-export>Export (JSON)</button>
          <label class="btn small">Import (JSON)<input type="file" accept="application/json,.json" data-import hidden></label>
          <button type="button" class="btn small" data-cache>Cache leeren und neu laden</button>
          <button type="button" class="btn small ghost danger" data-reset-cfg>Auf Standard zurücksetzen</button>
        </div>
        <p class="muted small">Version ${esc(window.__VER || '–')}</p>
      </section>
    </div>
    <div class="actions sticky-actions">
      <button type="button" class="btn ghost" data-close>Schließen</button>
      <button type="button" class="btn primary" data-save>Für alle speichern</button>
    </div>`,
    (root) => {
      $('#sheet').classList.add('wide');
      root.querySelector('[data-close]').addEventListener('click', closeSheet);
      root.querySelector('[data-save]').addEventListener('click', devSave);
      root.querySelectorAll('[data-upload]').forEach((inp) => inp.addEventListener('change', () => devUpload(inp)));
      root.querySelectorAll('[data-clear-img]').forEach((b) =>
        b.addEventListener('click', () => {
          const key = b.dataset.clearImg;
          db.removeImage(DRAFT[key].imgPath);
          devCollect();
          DRAFT[key].img = '';
          DRAFT[key].imgPath = '';
          renderDev();
        }),
      );
      root.querySelectorAll('[data-preview]').forEach((b) =>
        b.addEventListener('click', () => {
          devCollect();
          showStoerer(DRAFT[b.dataset.preview], b.dataset.preview === 'vac');
        }),
      );
      root.querySelector('[data-add-spruch]').addEventListener('click', () => {
        devCollect();
        DRAFT.vac.sprueche.push('');
        renderDev();
      });
      root.querySelectorAll('[data-del-spruch]').forEach((b) =>
        b.addEventListener('click', () => {
          devCollect();
          DRAFT.vac.sprueche.splice(Number(b.dataset.delSpruch), 1);
          renderDev();
        }),
      );
      root.querySelector('[data-log]').addEventListener('click', openLog);
      bindDevQuote(root);
      bindDevPush(root);
      root.querySelector('[data-export]').addEventListener('click', () => {
        devCollect();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(DRAFT, null, 2)], { type: 'application/json' }));
        a.download = '552-einstellungen.json';
        a.click();
      });
      root.querySelector('[data-import]').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => {
          try {
            DRAFT = deepMerge(CFG_DEFAULT, JSON.parse(r.result));
            renderDev();
            toast('Importiert – bitte noch speichern');
          } catch {
            toast('Ungültige Datei');
          }
        };
        r.readAsText(file);
      });
      root.querySelector('[data-cache]').addEventListener('click', async () => {
        try {
          const regs = (await navigator.serviceWorker?.getRegistrations()) || [];
          await Promise.all(regs.map((r) => r.unregister()));
          if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
        } finally {
          location.reload();
        }
      });
      root.querySelector('[data-reset-cfg]').addEventListener('click', () => {
        if (!confirm('Alle Einstellungen dieses Menüs auf Standard zurücksetzen? (Erst nach „Für alle speichern“ wirksam.)')) return;
        DRAFT = clone(CFG_DEFAULT);
        renderDev();
      });
    },
  );
}

function devCollect() {
  const v = (id) => document.getElementById(id);
  for (const key of ['start', 'vac']) {
    DRAFT[key].on = v(`d_${key}_on`).checked;
    DRAFT[key].title = v(`d_${key}_title`).value.slice(0, 200);
    DRAFT[key].btn = v(`d_${key}_btn`).value.slice(0, 30);
  }
  DRAFT.start.freq = v('d_start_freq').value;
  DRAFT.start.from = v('d_start_from').value;
  DRAFT.start.to = v('d_start_to').value;
  DRAFT.vac.random = v('d_vac_random').checked;
  DRAFT.vac.konfetti = v('d_vac_konfetti').checked;
  DRAFT.vac.sprueche = [...document.querySelectorAll('[data-spruch]')].map((i) => i.value);
  DRAFT.theme = v('d_theme').value;
  DRAFT.features = {
    board: v('d_f_board').checked,
    guests: v('d_f_guests').checked,
    overview: v('d_f_overview').checked,
    bridge: v('d_f_bridge').checked,
    dogs: v('d_f_dogs').checked,
    quotes: v('d_f_quotes').checked,
  };
  DRAFT.pin = v('d_pin').value.trim() || '0552';
  DRAFT.whatsapp = v('d_whatsapp').value.trim();
  DRAFT.push = {
    on: v('d_push_on').checked,
    url: pushBase(v('d_push_url').value),
    morning: v('d_push_morning').checked,
    morningTime: v('d_push_time').value,
    notes: v('d_push_notes').checked,
    dogs: v('d_push_dogs').checked,
  };
  DRAFT.kreditnext = {
    on: v('d_kn_on').checked,
    label: v('d_kn_label').value.trim() || 'KreditNext',
    members: [...document.querySelectorAll('[data-kn-member]')].filter((i) => i.checked).map((i) => i.dataset.knMember),
  };
}

async function devUpload(input) {
  const key = input.dataset.upload;
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return toast('Datei zu groß (max. 10 MB)');
  devCollect();
  toast('Lädt hoch …');
  try {
    const { url, path } = await db.uploadImage(room(), key, file);
    if (DRAFT[key].imgPath && DRAFT[key].imgPath !== path) db.removeImage(DRAFT[key].imgPath);
    DRAFT[key].img = url;
    DRAFT[key].imgPath = path;
    toast('Hochgeladen – bitte noch speichern');
    renderDev();
  } catch (err) {
    toast('Upload fehlgeschlagen: ' + err.message);
  }
}

async function devSave() {
  devCollect();
  if (DRAFT.whatsapp && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(DRAFT.whatsapp)) {
    return toast('Der WhatsApp-Link muss mit https://chat.whatsapp.com/ beginnen.');
  }
  DRAFT.vac.sprueche = DRAFT.vac.sprueche.map((s) => s.trim()).filter(Boolean);
  DRAFT.start.rev = Date.now(); // "nur einmal" zeigt den Störer nach jeder Änderung wieder
  try {
    await db.saveConfig(room(), DRAFT);
    state.cfg = deepMerge(CFG_DEFAULT, DRAFT);
    LS.set('552.cfg', JSON.stringify(state.cfg));
    applyConfig();
    closeSheet();
    render();
    toast('Gespeichert – gilt für alle');
  } catch (err) {
    toast('Nicht gespeichert: ' + err.message);
  }
}

// ---------- change log (developer menu) ----------
const LOG_TYPES = {
  z552_overrides: 'Status & Notiz',
  z552_plans: 'Planung',
  z552_board: 'Pinnwand',
  z552_guests: 'Gastplatz',
  z552_dogs: 'Hundekörbchen',
  z552_members: 'Mitglieder',
  z552_roomconfig: 'Einstellungen',
};
const fmtDay = (iso) => (iso ? `${WEEKDAYS_SHORT[weekday(iso.slice(0, 10))]} ${formatShort(iso.slice(0, 10))}` : '');
const statusLabel = (s) => (s ? STATUSES[s]?.label || s : '—');

function describeLog(e, nameOf) {
  const o = e.old_row || {};
  const n = e.new_row || {};
  const r = e.op === 'DELETE' ? o : n;
  switch (e.tbl) {
    case 'z552_overrides': {
      const who = nameOf(r.member_id);
      if (e.op === 'DELETE') return `${who}, ${fmtDay(o.date)}: auf Planung zurückgesetzt`;
      const parts = [];
      const amLabel = (r) => statusLabel(r.status) + (r.status_pm ? ` (nachm. ${statusLabel(r.status_pm)})` : '');
      if ((o.status || null) !== (n.status || null) || (o.status_pm || null) !== (n.status_pm || null)) parts.push(`Status ${amLabel(o)} → ${amLabel(n)}`);
      if ((o.note || '') !== (n.note || '')) parts.push(n.note ? `Notiz „${n.note}“` : 'Notiz gelöscht');
      return `${who}, ${fmtDay(r.date)}: ${parts.join(', ') || 'geändert'}`;
    }
    case 'z552_plans': {
      const verb = { INSERT: 'angelegt', UPDATE: 'geändert', DELETE: 'gelöscht' }[e.op];
      let what = '';
      try {
        what = describePlan(r);
      } catch {
        what = r.kind || '';
      }
      return `${nameOf(r.member_id)}: ${KIND_LABEL[r.kind] || 'Eintrag'} ${verb}${r.note ? ` („${r.note}“)` : ''} – ${what}`;
    }
    case 'z552_board': {
      const title = (r.title || '').trim() || (r.text || '').trim().split('\n')[0].slice(0, 40);
      if (e.op === 'INSERT') return `Notiz angepinnt: „${title}“`;
      if (e.op === 'DELETE') return `Notiz abgenommen: „${title}“`;
      return `Notiz geändert: „${title}“`;
    }
    case 'z552_guests': {
      const desk = DESKS.find((d) => d.id === r.desk)?.label || r.desk;
      if (e.op === 'DELETE') return `Gastplatz ${desk}, ${fmtDay(o.date)}: Reservierung für ${o.guest_name} aufgehoben`;
      return `Gastplatz ${desk}, ${fmtDay(n.date)}: reserviert für ${n.guest_name}`;
    }
    case 'z552_dogs': {
      if (e.op === 'DELETE') return `Hundekörbchen, ${fmtDay(o.date)}: geleert (vorher ${DOGS[o.dog]?.name || o.dog})`;
      return `Hundekörbchen, ${fmtDay(n.date)}: ${DOGS[n.dog]?.name || n.dog} liegt drin`;
    }
    case 'z552_members': {
      const deskLabel = (id) => DESKS.find((d) => d.id === id)?.label || 'kein Tisch';
      if (e.op === 'INSERT') return `${n.name} hinzugefügt${n.desk ? ` (Tisch ${deskLabel(n.desk)})` : ''}`;
      if (e.op === 'DELETE') return `${o.name} entfernt`;
      const parts = [];
      if (o.name !== n.name) parts.push(`Name ${o.name} → ${n.name}`);
      if ((o.desk || null) !== (n.desk || null)) parts.push(`Tisch ${deskLabel(o.desk)} → ${deskLabel(n.desk)}`);
      return `${n.name}: ${parts.join(', ') || 'geändert'}`;
    }
    case 'z552_roomconfig': {
      const a = o.config || {};
      const b = n.config || {};
      const names = { start: 'Start-Störer', vac: 'Urlaubs-Störer', features: 'Funktionen', theme: 'Design', pin: 'PIN', whatsapp: 'WhatsApp-Link', kreditnext: 'Zusatz-Status', quotes: 'Zitat des Tages', push: 'Push-Mitteilungen' };
      const changed = Object.keys({ ...a, ...b })
        .filter((k) => names[k] && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
        .map((k) => names[k]);
      return `Entwicklermenü gespeichert${changed.length ? `: ${changed.join(', ')}` : ''}`;
    }
    default:
      return `${e.tbl} ${e.op}`;
  }
}

async function openLog() {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  openSheet('<header class="sheet-head"><h2>Logbuch</h2><p>Wird geladen …</p></header>', () => $('#sheet').classList.add('wide'));
  let entries = [];
  try {
    entries = await db.getLog(room(), since);
  } catch (err) {
    openSheet(
      `<header class="sheet-head"><h2>Logbuch</h2></header><p class="warn">${esc(err.message)}</p>
       <div class="actions"><button type="button" class="btn" data-back>Zurück zum Entwicklermenü</button></div>`,
      (root) => {
        $('#sheet').classList.add('wide');
        root.querySelector('[data-back]').addEventListener('click', openDev);
      },
    );
    return;
  }
  // names of people, also of people who have since been removed
  const names = new Map(state.data.members.map((m) => [m.id, m.name]));
  for (const e of entries) if (e.tbl === 'z552_members') for (const r of [e.old_row, e.new_row]) if (r?.id && !names.has(r.id)) names.set(r.id, r.name);
  const nameOf = (id) => names.get(id) || 'Unbekannt';
  const rows = entries.map((e) => ({ e, text: describeLog(e, nameOf), actor: e.actor_name || (e.actor_id && names.get(e.actor_id)) || 'unbekannt' }));
  const actors = [...new Set(rows.map((r) => r.actor))].sort();
  const filter = { actor: '', tbl: '', q: '' };

  const draw = (root) => {
    const q = filter.q.trim().toLowerCase();
    const list = rows.filter(
      (r) => (!filter.actor || r.actor === filter.actor) && (!filter.tbl || r.e.tbl === filter.tbl) && (!q || (r.text + ' ' + r.actor).toLowerCase().includes(q)),
    );
    let lastDay = '';
    const html = list
      .slice(0, 500)
      .map((r) => {
        const d = new Date(r.e.at);
        const day = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' });
        const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        const head = day !== lastDay ? `<li class="log-day">${esc(day)}</li>` : '';
        lastDay = day;
        return `${head}<li class="log-row"><span class="log-time">${time}</span><span class="log-main"><span class="log-what">${esc(r.text)}</span>
          <span class="log-meta">${esc(r.actor)} · ${esc(LOG_TYPES[r.e.tbl] || r.e.tbl)}</span></span></li>`;
      })
      .join('');
    root.querySelector('.log-count').textContent = `${list.length} ${list.length === 1 ? 'Eintrag' : 'Einträge'}${list.length > 500 ? ' (die neuesten 500 angezeigt)' : ''}`;
    root.querySelector('.log-list').innerHTML = html || '<li class="empty">Keine Einträge.</li>';
  };

  openSheet(
    `<header class="sheet-head"><h2>Logbuch</h2><p>Alle Änderungen der letzten 90 Tage im Raum <strong>${esc(room())}</strong></p></header>
     <div class="log-filters">
       <select data-f="actor" aria-label="Person"><option value="">Alle Personen</option>${actors.map((a) => `<option>${esc(a)}</option>`).join('')}</select>
       <select data-f="tbl" aria-label="Art"><option value="">Alle Arten</option>${Object.entries(LOG_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
       <input data-f="q" type="search" placeholder="Suchen …" aria-label="Suchen">
     </div>
     <p class="muted small log-count"></p>
     <ul class="log-list"></ul>
     <div class="actions sticky-actions"><button type="button" class="btn ghost" data-back>Zurück zum Entwicklermenü</button><button type="button" class="btn primary" data-close>Schließen</button></div>`,
    (root) => {
      $('#sheet').classList.add('wide');
      root.querySelectorAll('[data-f]').forEach((el) =>
        el.addEventListener('input', () => {
          filter[el.dataset.f] = el.value;
          draw(root);
        }),
      );
      root.querySelector('[data-back]').addEventListener('click', openDev);
      root.querySelector('[data-close]').addEventListener('click', closeSheet);
      draw(root);
    },
  );
}

// ---------- push notifications ----------
const pushCfg = () => ({ on: true, url: '', morning: true, morningTime: '08:30', notes: true, dogs: true, ...(state.cfg?.push || {}) });
const pushBase = (url) => String(url || '').trim().replace(/\/+$/, '');
const PUSH_TIMES = ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30'];

/** Tells the push centre about a new note / dog, it then informs the others (fire and forget). */
function notifyPush(kind, extra = {}) {
  const c = pushCfg();
  if (isDemo || !c.on || !c.url) return;
  fetch(pushBase(c.url) + '/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: room(), kind, actor: me()?.id || null, ...extra }),
  }).catch(() => {});
}

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentPushSub() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]);
  return reg ? reg.pushManager.getSubscription() : null;
}

/** "Mitteilungen" section in the personal settings (per device). */
async function renderPushBox(el) {
  const c = pushCfg();
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const head = '<h3>Mitteilungen auf diesem Gerät</h3>';
  const say = (html) => (el.innerHTML = head + html);
  if (isDemo) return say('<p class="muted small">Im Demo-Modus nicht verfügbar.</p>');
  if (!c.url) return say('<p class="muted small">Noch nicht eingerichtet – die Adresse der Push-Zentrale fehlt im Entwicklermenü.</p>');
  if (!c.on) return say('<p class="muted small">Mitteilungen sind im Entwicklermenü für alle ausgeschaltet.</p>');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return say(
      isIOS && !standalone
        ? '<p class="warn">Auf dem iPhone zuerst über „Teilen → Zum Home-Bildschirm“ installieren und 552 dann von dort öffnen.</p>'
        : '<p class="warn">Dieser Browser kann keine Mitteilungen empfangen.</p>',
    );
  }
  if (Notification.permission === 'denied') {
    return say('<p class="warn">Mitteilungen sind für 552 blockiert. Bitte in den Einstellungen des Handys bzw. Browsers erlauben.</p>');
  }
  say('<p class="muted small">Wird geprüft …</p>');
  let sub = null;
  let row = null;
  try {
    sub = await currentPushSub();
    row = sub ? await db.getPush(sub.endpoint) : null;
  } catch (err) {
    return say(`<p class="warn">${esc(err.message || 'Nicht erreichbar')}</p>`);
  }
  if (!sub || !row) {
    say('<p class="muted small">Morgen-Erinnerung, neue Pinnwand-Notizen und Hunde im Körbchen als Mitteilung aufs Handy.</p><button type="button" class="btn primary" data-push-on>Mitteilungen einschalten</button>');
    el.querySelector('[data-push-on]').addEventListener('click', () => enablePush(() => renderPushBox(el)));
    return;
  }
  if (row.member_id !== me()?.id) db.savePush(room(), { ...row, member_id: me().id }).catch(() => {}); // person switched on this device
  const prefs = { morning: true, notes: true, dogs: true, ...(row.prefs || {}) };
  const opt = (key, on, label) => (on ? check(`p_${key}`, prefs[key] !== false, label).replace('<input ', `<input data-pref="${key}" `) : '');
  say(`<div class="stack-tight">
      ${opt('morning', c.morning, `Morgen-Erinnerung (Mo–Fr ${c.morningTime} Uhr, nur wenn noch nichts eingetragen ist)`)}
      ${opt('notes', c.notes, 'Neue Notiz an der Pinnwand')}
      ${opt('dogs', c.dogs, 'Hund im Körbchen eingetragen')}
    </div>
    <div class="actions left"><button type="button" class="btn small" data-push-test>Test senden</button><button type="button" class="btn small ghost danger" data-push-off>Ausschalten</button></div>`);
  el.querySelectorAll('[data-pref]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      prefs[cb.dataset.pref] = cb.checked;
      try {
        await db.setPushPrefs(sub.endpoint, prefs);
        toast('Gespeichert');
      } catch (err) {
        toast('Nicht gespeichert: ' + err.message);
      }
    }),
  );
  el.querySelector('[data-push-test]').addEventListener('click', async () => {
    try {
      const r = await fetch(pushBase(c.url) + '/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).then((x) => x.json());
      toast(r.sent ? 'Test gesendet – kommt gleich an' : `Senden fehlgeschlagen${r.error ? ': ' + r.error : ''}`);
    } catch {
      toast('Push-Zentrale nicht erreichbar');
    }
  });
  el.querySelector('[data-push-off]').addEventListener('click', async () => {
    await db.deletePush(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
    toast('Mitteilungen ausgeschaltet');
    renderPushBox(el);
  });
}

async function enablePush(done) {
  const c = pushCfg();
  try {
    if (!me()) return;
    const { publicKey } = await fetch(pushBase(c.url) + '/').then((r) => r.json());
    if (!publicKey) return toast('Die Push-Zentrale hat noch keinen Schlüssel.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Mitteilungen wurden nicht erlaubt.');
    const reg = await navigator.serviceWorker.ready;
    const old = await reg.pushManager.getSubscription();
    if (old) await old.unsubscribe().catch(() => {});
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
    const j = sub.toJSON();
    await db.savePush(room(), { endpoint: j.endpoint, member_id: me().id, p256dh: j.keys.p256dh, auth: j.keys.auth, prefs: { morning: true, notes: true, dogs: true } });
    toast('Mitteilungen sind an');
  } catch (err) {
    toast('Einschalten fehlgeschlagen: ' + (err.message || err));
  }
  done?.();
}

/** Small hint on the main page until notifications are switched on (can be postponed for 14 days). */
let pushHintChecked = false;
async function renderPushHint(force = false) {
  const el = $('#push-hint');
  if (pushHintChecked && !force) return;
  pushHintChecked = true;
  el.hidden = true;
  const c = pushCfg();
  const later = Number(LS.get('552.pushHintLater', '0'));
  if (isDemo || !c.on || !c.url || !me() || Date.now() < later) return;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let html;
  if (!supported) {
    if (!(isIOS && !standalone)) return;
    html = '<p>🔔 Für Mitteilungen 552 über <strong>Teilen → Zum Home-Bildschirm</strong> installieren und von dort öffnen.</p>';
  } else {
    if (Notification.permission === 'denied') return;
    try {
      const sub = await currentPushSub();
      if (sub && (await db.getPush(sub.endpoint))) return; // already on
    } catch {
      return;
    }
    html = '<p>🔔 <strong>Mitteilungen einschalten?</strong> Morgen-Erinnerung, neue Notizen und Hunde im Körbchen aufs Handy.</p><button type="button" class="btn small primary" data-hint-on>Einschalten</button>';
  }
  el.innerHTML = html + '<button type="button" class="btn small ghost" data-hint-later>Später</button>';
  el.hidden = false;
  el.querySelector('[data-hint-on]')?.addEventListener('click', () => enablePush(() => renderPushHint(true)));
  el.querySelector('[data-hint-later]').addEventListener('click', () => {
    LS.set('552.pushHintLater', String(Date.now() + 14 * 86400000));
    el.hidden = true;
  });
}

// developer menu: push section
function devPushHtml(d) {
  const p = { ...pushCfg(), ...(d.push || {}) };
  const time = `<select id="d_push_time">${PUSH_TIMES.map((t) => `<option${t === p.morningTime ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  return `<h3>Push-Mitteilungen</h3>
    ${check('d_push_on', p.on, 'Push-Mitteilungen aktiv (für alle)')}
    <label>Adresse der Push-Zentrale<input id="d_push_url" value="${esc(p.url)}" placeholder="https://552-push.….workers.dev" inputmode="url" autocomplete="off"></label>
    <div class="dev-inline">${check('d_push_morning', p.morning, 'Morgen-Erinnerung um')}${time}<span class="muted small">Uhr (Mo–Fr)</span></div>
    ${check('d_push_notes', p.notes, 'Bei neuer Pinnwand-Notiz')}
    ${check('d_push_dogs', p.dogs, 'Wenn ein Hund eingetragen wird')}
    <p class="muted small" data-push-devices>Angemeldete Geräte werden geladen …</p>
    <div class="dev-send">
      <h4>Mitteilung senden</h4>
      <input id="d_send_title" maxlength="60" placeholder="Überschrift (optional, sonst „552“)">
      <textarea id="d_send_body" maxlength="200" rows="2" placeholder="Text, z. B. Kuchen in der Küche! 🍰"></textarea>
      <div class="dev-inline">
        <select id="d_send_to"><option value="">an alle</option>${state.data.members.map((m) => `<option value="${m.id}">an ${esc(m.name)}</option>`).join('')}</select>
        <button type="button" class="btn small primary" data-push-send>Jetzt senden</button>
      </div>
    </div>`;
}
function bindDevPush(root) {
  const devEl = root.querySelector('[data-push-devices]');
  db.listPush(room())
    .then((rows) => {
      const by = {};
      for (const r of rows) by[r.member_id] = (by[r.member_id] || 0) + 1;
      const list = Object.entries(by).map(([id, n]) => `${member(id)?.name || '?'}${n > 1 ? ` (${n})` : ''}`);
      devEl.textContent = list.length ? `Angemeldet: ${list.join(', ')}` : 'Noch kein Gerät angemeldet (jede Person: Einstellungen → Mitteilungen einschalten).';
    })
    .catch(() => (devEl.textContent = 'Push-Tabelle fehlt – bitte update-v8.sql in Supabase ausführen.'));
  root.querySelector('[data-push-send]').addEventListener('click', async (e) => {
    const url = pushBase(document.getElementById('d_push_url').value) || pushBase(pushCfg().url);
    const body = document.getElementById('d_send_body').value.trim();
    if (!url) return toast('Zuerst die Adresse der Push-Zentrale eintragen.');
    if (!body) return toast('Bitte einen Text eingeben.');
    e.target.disabled = true;
    try {
      const r = await fetch(url + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: room(), pin: state.cfg.pin, title: document.getElementById('d_send_title').value.trim(), body, to: document.getElementById('d_send_to').value || null }),
      }).then((x) => x.json());
      if (r.error) toast('Nicht gesendet: ' + r.error);
      else {
        toast(r.sent ? `Gesendet an ${r.sent} ${r.sent === 1 ? 'Gerät' : 'Geräte'}` : 'Kein angemeldetes Gerät erreicht');
        document.getElementById('d_send_body').value = '';
      }
    } catch {
      toast('Push-Zentrale nicht erreichbar');
    } finally {
      e.target.disabled = false;
    }
  });
}

// ---------- Störer ----------
function showStoerer(s, withSpruch = false) {
  let title = s.title;
  if (withSpruch && s.random && s.sprueche?.length) title = s.sprueche[Math.floor(Math.random() * s.sprueche.length)];
  const dlg = $('#stoerer');
  dlg.innerHTML = `<div class="stoerer-card">
      <h2>${esc(title).replace(/\n/g, '<br>')}</h2>
      <img src="${esc(imgPreview(s.img))}" alt="">
      <button type="button" class="btn primary" data-stoerer-close>${esc(s.btn || 'OK')}</button>
    </div>`;
  dlg.querySelector('[data-stoerer-close]').addEventListener('click', () => dlg.close());
  openDialog(dlg);
  if (withSpruch && s.konfetti) konfetti();
}

function maybeShowStartStoerer() {
  const s = state.cfg.start;
  if (!s.on) return;
  const t = todayBerlin();
  if ((s.from && t < s.from) || (s.to && t > s.to)) return;
  if (s.freq === 'daily' && LS.get('552.startSeen') === t) return;
  if (s.freq === 'once' && LS.get('552.startSeenRev') === String(s.rev || 0)) return;
  LS.set('552.startSeen', t);
  LS.set('552.startSeenRev', String(s.rev || 0));
  showStoerer(s);
}

function konfetti() {
  const colors = ['#2fa84f', '#e8b923', '#d64541', '#3b6fd8', '#ff8fb1', '#ffffff'];
  const layer = document.createElement('div');
  layer.className = 'konfetti';
  for (let i = 0; i < 120; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.6 + 's';
    p.style.animationDuration = 2.2 + Math.random() * 1.6 + 's';
    p.style.setProperty('--x', (Math.random() * 2 - 1) * 120 + 'px');
    p.style.setProperty('--rot', Math.random() * 720 + 'deg');
    layer.appendChild(p);
  }
  // inside the open Störer dialog, so it is drawn above it (dialogs live in the top layer)
  ($('#stoerer').open ? $('#stoerer') : document.body).appendChild(layer);
  setTimeout(() => layer.remove(), 4500);
}

// ---------- dialogs: background lock, rubber band, "Aua!" ----------
let scrollLocks = 0;
let lockedY = 0;
function lockScroll() {
  if (scrollLocks++ > 0) return;
  lockedY = window.scrollY;
  Object.assign(document.body.style, { position: 'fixed', top: `-${lockedY}px`, left: '0', right: '0', width: '100%' });
}
function unlockScroll() {
  if (scrollLocks === 0 || --scrollLocks > 0) return;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '' });
  window.scrollTo(0, lockedY);
}
function openDialog(dlg) {
  if (dlg.open) return;
  dlg.showModal();
  lockScroll();
}

const RUBBER_MAX = 90; // max. visible stretch in px
const TEAR_AT = 240; // finger distance in px at which the dialog "tears"
const rubber = (d) => Math.sign(d) * RUBBER_MAX * (1 - 1 / (Math.abs(d) / (RUBBER_MAX * 1.2) + 1));

/** Lets a dialog stretch like rubber at its scroll limits instead of scrolling the page behind it. */
function setupRubberBand(dlg) {
  let start = null;
  let torn = false;
  const setOffset = (px, animate) => {
    dlg.style.transition = animate ? 'transform 0.45s cubic-bezier(0.2, 1.6, 0.4, 1)' : 'none';
    dlg.style.setProperty('--pull', `${px}px`);
    dlg.classList.toggle('pulled', px !== 0);
  };
  dlg.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1 || torn) return;
      start = { y: e.touches[0].clientY, active: false };
    },
    { passive: true },
  );
  dlg.addEventListener(
    'touchmove',
    (e) => {
      if (!start || torn) return;
      const dy = e.touches[0].clientY - start.y;
      // which element would scroll? (the dialog itself, or a scrollable field inside it)
      const scroller = e.target.closest('textarea') && e.target.scrollHeight > e.target.clientHeight ? e.target : dlg;
      const atTop = scroller.scrollTop <= 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if (!start.active) {
        if ((dy > 0 && atTop) || (dy < 0 && atBottom)) {
          start.active = true;
          start.y = e.touches[0].clientY; // stretch starts at the edge, not where the finger began
        } else return; // normal scrolling inside the dialog
      }
      e.preventDefault(); // never scroll the page behind
      const d = e.touches[0].clientY - start.y;
      if ((d > 0 && !atTop) || (d < 0 && !atBottom)) {
        start.active = false;
        setOffset(0, false);
        return;
      }
      if (Math.abs(d) > TEAR_AT) {
        tear(d > 0 ? 1 : -1);
        return;
      }
      setOffset(rubber(d), false);
    },
    { passive: false },
  );
  const release = () => {
    if (!start) return;
    start = null;
    if (!torn) setOffset(0, true);
  };
  dlg.addEventListener('touchend', release);
  dlg.addEventListener('touchcancel', release);
  dlg.addEventListener('close', () => {
    start = null;
    torn = false;
    dlg.classList.remove('torn', 'pulled');
    dlg.style.removeProperty('--pull');
    dlg.querySelectorAll('.crack, .aua').forEach((x) => x.remove());
  });

  function tear(dir) {
    torn = true;
    start = null;
    setOffset(RUBBER_MAX * dir, false);
    navigator.vibrate?.([30, 40, 60]);
    const crack = document.createElement('div');
    crack.className = 'crack';
    crack.innerHTML =
      '<svg viewBox="0 0 400 40" preserveAspectRatio="none"><polyline points="0,20 30,8 55,30 85,6 110,28 140,10 170,32 200,12 230,30 260,6 290,26 320,8 350,30 380,12 400,22"/></svg>';
    const aua = document.createElement('div');
    aua.className = 'aua';
    aua.textContent = 'Aua!';
    dlg.append(crack, aua);
    dlg.classList.add('torn');
    setTimeout(() => {
      dlg.classList.remove('torn');
      crack.remove();
      setOffset(0, true);
    }, 750);
    setTimeout(() => aua.classList.add('out'), 1100);
    setTimeout(() => {
      aua.remove();
      torn = false;
    }, 1400);
  }
}

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ---------- navigation ----------
function selectDay(iso) {
  state.selected = iso;
  renderWeekbar();
  renderRoom();
  renderOverview();
}

function shiftWeek(delta) {
  const idx = Math.max(0, weekDays().indexOf(state.selected));
  state.weekStart = addDays(state.weekStart, delta * 7);
  state.selected = addDays(state.weekStart, idx);
  render();
  load();
}

function goToday() {
  state.today = todayBerlin();
  state.weekStart = mondayOf(firstWorkday(state.today));
  state.selected = firstWorkday(state.today);
  render();
  load();
}

function setView(view) {
  state.view = view;
  LS.set('552.view', view);
  render();
  window.scrollTo({ top: 0 });
}

// ---------- events ----------
function bind() {
  $('#tab-room').addEventListener('click', () => setView('room'));
  $('#tab-plan').addEventListener('click', () => setView('plan'));
  $('#me-chip').addEventListener('click', openSettings);
  $('#basket').addEventListener('click', openBasket);
  $('#app .brand-logo').addEventListener('click', onLogoTap);
  $('#room-chip').addEventListener('click', shareRoom);
  $('#cal-prev').addEventListener('click', () => shiftWeek(-1));
  $('#cal-next').addEventListener('click', () => shiftWeek(1));
  $('#cal-today').addEventListener('click', goToday);
  $('#db-retry').addEventListener('click', () => (room() ? enterRoom() : location.reload()));
  $('#update-btn').addEventListener('click', applyUpdate);

  // red slider: tap a day or drag the slider along the strip
  const strip = $('#cal-days');
  let drag = null;
  strip.addEventListener('pointerdown', (e) => {
    drag = { rect: strip.getBoundingClientRect(), startX: e.clientX, moved: false, id: e.pointerId };
  });
  strip.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.abs(e.clientX - drag.startX) < 6) return;
    if (!drag.moved) strip.setPointerCapture(e.pointerId);
    drag.moved = true;
    const cell = drag.rect.width / 5;
    moveSlider(0, Math.min(Math.max(e.clientX - drag.rect.left - cell / 2, 0), cell * 4));
  });
  strip.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const cell = drag.rect.width / 5;
    const idx = Math.min(4, Math.max(0, Math.floor((e.clientX - drag.rect.left) / cell)));
    drag = null;
    selectDay(weekDays()[idx]);
  });
  strip.addEventListener('pointercancel', () => {
    drag = null;
    moveSlider(Math.max(0, weekDays().indexOf(state.selected)));
  });
  strip.addEventListener('keydown', (e) => {
    const idx = weekDays().indexOf(state.selected);
    if (e.key === 'ArrowRight') idx < 4 ? selectDay(weekDays()[idx + 1]) : shiftWeek(1);
    else if (e.key === 'ArrowLeft') idx > 0 ? selectDay(weekDays()[idx - 1]) : shiftWeek(-1);
    else return;
    e.preventDefault();
    requestAnimationFrame(() => $('#cal-days [aria-selected="true"]')?.focus());
  });

  // swipe on the room image moves one day
  const stage = $('#stage');
  let swipe = null;
  stage.addEventListener('touchstart', (e) => (swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY }), { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!swipe) return;
    const dx = e.changedTouches[0].clientX - swipe.x;
    const dy = e.changedTouches[0].clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const idx = weekDays().indexOf(state.selected);
      if (dx < 0) idx < 4 ? selectDay(weekDays()[idx + 1]) : shiftWeek(1);
      else idx > 0 ? selectDay(weekDays()[idx - 1]) : shiftWeek(-1);
    }
  });

  document.addEventListener('click', (e) => {
    const desk = e.target.closest('[data-desk]');
    if (desk) return openDesk(desk.dataset.desk);
    const chip = e.target.closest('[data-member]');
    if (chip) return openPerson(chip.dataset.member);
    if (e.target.closest('[data-note-add]')) return openNoteEditor();
    const note = e.target.closest('[data-note]');
    if (note) return openNote(note.dataset.note);
    const pick = e.target.closest('[data-pick]');
    if (pick) return selectDay(pick.dataset.pick);
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      state.editPlanId = edit.dataset.edit;
      renderPlan();
      $('#plan-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      if (confirm('Eintrag wirklich löschen?')) mutate(() => db.deletePlan(room(), del.dataset.delete), 'Gelöscht');
      return;
    }
    if (e.target.closest('[data-cancel-edit]')) {
      state.editPlanId = null;
      renderPlan();
      return;
    }
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      LS.set('552.planFilter', filter.dataset.filter);
      renderPlan();
    }
  });

  $('#plan-form').addEventListener('change', (e) => {
    if (['kind', 'repeat', 'member'].includes(e.target.name)) syncPlanForm();
    const form = $('#plan-form');
    if (e.target.name === 'start_date' && form.end_date.value < e.target.value) form.end_date.value = e.target.value;
  });
  $('#plan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const plan = readPlanForm();
    if (!plan.member_id) return toast('Bitte eine Person wählen.');
    if (plan.kind === 'absence' && plan.end_date < plan.start_date) return toast('Das Enddatum liegt vor dem Start.');
    if (plan.kind === 'recurring' && plan.end_date && plan.end_date < plan.start_date) return toast('Das Enddatum liegt vor dem Start.');
    const wasEdit = Boolean(state.editPlanId);
    state.editPlanId = null;
    const isVacation = !wasEdit && plan.kind === 'absence' && plan.status === 'away';
    mutate(() => db.savePlan(room(), plan), wasEdit ? 'Gespeichert' : 'Eingetragen').then((ok) => {
      if (ok && isVacation && state.cfg.vac.on) showStoerer(state.cfg.vac, true);
    });
  });

  const dlg = $('#sheet');
  dlg.addEventListener('close', () => {
    state.sheetOpen = false;
    dlg.classList.remove('wide');
    const onClose = state.onSheetClose;
    state.onSheetClose = null;
    onClose?.();
  });
  dlg.addEventListener('close', unlockScroll);
  $('#stoerer').addEventListener('close', unlockScroll);
  setupRubberBand(dlg);
  setupRubberBand($('#stoerer'));
  $('#stoerer').addEventListener('click', (e) => {
    if (e.target === $('#stoerer')) $('#stoerer').close();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeSheet();
  });

  // fresh data after standby / tab switch; "last seen" every minute while visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !room()) return;
    const t = todayBerlin();
    if (t !== state.today) goToday();
    else load();
  });
  window.addEventListener('online', () => room() && load());
  setInterval(heartbeat, 60000);
}

async function heartbeat() {
  if (document.visibilityState !== 'visible' || !room() || !me()) return;
  try {
    const rows = await db.touch(room(), me().id);
    if (Array.isArray(rows) && rows.length === 0) showSetup('who', 'Du bist in diesem Raum nicht mehr eingetragen. Bitte neu auswählen.');
  } catch {
    /* offline – ignore */
  }
}

// ---------- updates (same pattern as the vacation app) ----------
let waitingWorker = null;
function showUpdate(worker) {
  waitingWorker = worker;
  $('#ubanner').hidden = false;
}
function applyUpdate() {
  if (waitingWorker) waitingWorker.postMessage('skipWaiting');
  else location.reload();
}
function registerSW() {
  if (!('serviceWorker' in navigator) || isDemo) return;
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw);
        });
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60000);
    })
    .catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

// ---------- start ----------
fetch('version.txt', { cache: 'no-store' })
  .then((r) => (r.ok ? r.text() : ''))
  .then((t) => (window.__VER = t.trim()))
  .catch(() => {});
state.cfg = deepMerge(CFG_DEFAULT, cachedConfig() || {});
applyConfig();
setActor(state.session?.memberId);
renderFurniture();
bind();
registerSW();
if (state.session?.room) enterRoom();
else showSetup('room');
