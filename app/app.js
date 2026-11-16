// 552 – Zimmer-App
import { db, DbError, isDemo, LS, newMemberId, newRoomCode } from './data.js';
import {
  addDays,
  DESKS,
  formatShort,
  fromISO,
  holidayName,
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
  data: { members: [], plans: [], overrides: [], guests: [], board: [] },
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
    state.today = todayBerlin();
    $('#dbbanner').hidden = true;
    if (!me()) return showSetup('who');
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
  } catch (err) {
    toast(err instanceof DbError ? 'Speichern fehlgeschlagen: ' + err.message : 'Speichern fehlgeschlagen');
  }
}

// ---------- rendering ----------
function render() {
  document.body.dataset.view = state.view;
  $('#tab-room').setAttribute('aria-selected', state.view === 'room');
  $('#tab-plan').setAttribute('aria-selected', state.view === 'plan');
  $('#me-chip').textContent = me()?.name || '…';
  $('#room-chip').textContent = room() || '';
  $('#demo-flag').hidden = !isDemo;
  if (state.view === 'room') {
    renderWeekbar();
    renderRoom();
    renderBoard();
    renderOverview();
  } else {
    renderPlan();
  }
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
  $('#cal-days').innerHTML = days
    .map((iso, i) => {
      const hol = holidayName(iso);
      const dots = people
        .map((p) => {
          const s = dayInfo(p.id, iso).status;
          return `<i class="dot" style="--c:${STATUSES[s].color}" title="${esc(p.name)}: ${STATUSES[s].label}"></i>`;
        })
        .join('');
      return `<button class="cal-day${iso === state.today ? ' is-today' : ''}${hol ? ' is-holiday' : ''}" data-day="${i}" role="tab" aria-selected="${iso === state.selected}" aria-label="${WEEKDAYS_LONG[i]} ${formatShort(iso)}${hol ? ', ' + esc(hol) : ''}">
        <span class="cal-wd">${WEEKDAYS_SHORT[i]}</span>
        <span class="cal-num">${fromISO(iso).getUTCDate()}</span>
        <span class="cal-dots">${dots}</span>
        ${hol ? `<span class="cal-tag">${esc(hol)}</span>` : isBridgeDay(iso) ? '<span class="cal-tag bridge">Brückentag</span>' : ''}
      </button>`;
    })
    .join('');
  moveSlider(Math.max(0, days.indexOf(state.selected)));
}

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
    const src =
      info.source === 'override'
        ? info.overridden
          ? '<span class="desk-src" title="Für diesen Tag geändert">✎</span>'
          : ''
        : info.source === 'plan' || info.source === 'turnus'
          ? `<span class="desk-src" title="Aus der Planung">${info.source === 'turnus' ? '↻' : '▤'}</span>`
          : '';
    return `<button class="desk status-${info.status}${guest ? ' has-guest' : ''}${owner.id === me()?.id ? ' is-me' : ''}"
        style="${pos};--c:${st.color}" data-desk="${desk.id}" data-note-pos="${desk.notePos}"
        aria-label="${esc(owner.name)}: ${st.label}${info.note ? ', ' + esc(info.note) : ''}${guest ? ', Gast ' + esc(guest.guest_name) : ''}">
        <span class="desk-head"><span class="desk-name">${esc(owner.name)}</span>${src}</span>
        <span class="desk-status">${guest && info.status !== 'office' ? '' : st.label}</span>
        ${guestTag}${note}
      </button>`;
  }).join('');

  // members without a desk
  const deskless = state.data.members.filter((m) => !m.desk);
  $('#deskless').hidden = !deskless.length;
  $('#deskless').innerHTML = deskless.length
    ? `<span class="muted">Ohne festen Tisch:</span> ` +
      deskless
        .map((m) => {
          const info = dayInfo(m.id, iso);
          return `<button class="chip" data-member="${m.id}" style="--c:${STATUSES[info.status].color}"><i class="dot" style="--c:${STATUSES[info.status].color}"></i>${esc(m.name)}${info.note ? ` · ${esc(info.note)}` : ''}</button>`;
        })
        .join('')
    : '';
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
  const statusOf = (mid, iso) => dayInfo(mid, iso).status;
  const deskPeople = people.filter((p) => p.desk);
  const full = deskPeople.length ? days.filter((iso) => deskPeople.every((p) => statusOf(p.id, iso) === 'office')) : [];
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

  const head = days
    .map((iso) => `<th scope="col"><button data-pick="${iso}" class="${iso === state.selected ? 'sel' : ''}">${WEEKDAYS_SHORT[weekday(iso)]}</button></th>`)
    .join('');
  const rows = people
    .map((p) => {
      const cells = days
        .map((iso) => {
          const s = statusOf(p.id, iso);
          return `<td><span class="cell" style="--c:${STATUSES[s].color}" title="${STATUSES[s].label}"></span></td>`;
        })
        .join('');
      const officeDays = days.filter((iso) => statusOf(p.id, iso) === 'office').length;
      return `<tr><th scope="row">${esc(p.name)}</th>${cells}<td class="count">${officeDays}×</td></tr>`;
    })
    .join('');
  const counts = days.map((iso) => `<td class="count">${people.filter((p) => statusOf(p.id, iso) === 'office').length}</td>`).join('');

  $('#overview').innerHTML = `
    <h3>Wochenüberblick</h3>
    <p class="summary">${esc(summary)}</p>
    <table class="matrix">
      <thead><tr><th></th>${head}<th class="count" title="Bürotage">Büro</th></tr></thead>
      <tbody>${rows}<tr class="total"><th scope="row">im Büro</th>${counts}<td></td></tr></tbody>
    </table>
    ${hints.map((h) => `<p class="hint">${esc(h)}</p>`).join('')}
    <p class="legend">${Object.values(STATUSES)
      .map((s) => `<span><i class="dot" style="--c:${s.color}"></i>${s.label}</span>`)
      .join('')}<span>✎ geändert</span><span>▤ geplant</span><span>↻ Turnus</span></p>`;
}

// ---------- planning view ----------
const KIND_LABEL = { absence: 'Urlaub / Abwesenheit', single: 'Einzeltermin', recurring: 'Turnus' };
const NTH_LABEL = { 1: '1.', 2: '2.', 3: '3.', 4: '4.', '-1': 'letzten' };

function describePlan(p) {
  const st = STATUSES[p.status].label;
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
      <label>Status<select name="status">${['away', 'mobile', 'office'].map((s) => opt(s, f.status, STATUSES[s].label)).join('')}</select></label>
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
  $('#sheet-body').innerHTML = html;
  state.sheetOpen = true;
  if (!dlg.open) dlg.showModal();
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
      ? `Laut Planung: ${STATUSES[base.status].label}${base.note ? ` (${esc(base.note)})` : ''}`
      : base.source === 'holiday'
        ? `Feiertag: ${esc(base.note)}`
        : 'Kein Planeintrag';

  openSheet(
    `<header class="sheet-head">
      <h2>${esc(p.name)} <small>${desk ? `· Tisch ${esc(desk.label)}` : '· ohne festen Tisch'}</small></h2>
      <p>${WEEKDAYS_LONG[weekday(iso)]}, ${formatShort(iso)}${iso.slice(0, 4)}</p>
    </header>
    <div class="status-pick" role="radiogroup" aria-label="Status">
      ${['office', 'mobile', 'away']
        .map(
          (s) => `<button type="button" role="radio" aria-checked="${info.status === s}" data-status="${s}" style="--c:${STATUSES[s].color}">
            <i class="dot big" style="--c:${STATUSES[s].color}"></i>${STATUSES[s].label}</button>`,
        )
        .join('')}
    </div>
    <form class="note-form" data-note-form>
      <label>Notiz für diesen Tag<input name="note" maxlength="60" value="${esc(ov?.note ?? '')}" placeholder="${esc(base.note || 'z. B. ab 11 Uhr da')}"></label>
      <button class="btn" type="submit">Speichern</button>
    </form>
    <p class="base-info">${baseText}${ov ? ' · <strong>für diesen Tag geändert</strong>' : ''}</p>
    ${ov ? '<button type="button" class="btn ghost" data-reset>Auf Planung zurücksetzen</button>' : ''}
    ${desk ? `<section class="guest-box"><h3>Gastplatz</h3>${guestSection(desk.id, iso, info.status === 'office', p.name)}</section>` : ''}`,
    (root) => {
      root.querySelectorAll('[data-status]').forEach((b) =>
        b.addEventListener('click', () => {
          closeSheet();
          mutate(() => db.setOverride(room(), { member_id: mid, date: iso, status: b.dataset.status, note: ov?.note ?? null }));
        }),
      );
      root.querySelector('[data-note-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const note = e.target.note.value.trim().slice(0, 60);
        closeSheet();
        if (!note && ov && !ov.status) mutate(() => db.clearOverride(room(), mid, iso));
        else mutate(() => db.setOverride(room(), { member_id: mid, date: iso, status: ov?.status ?? null, note: note || null }));
      });
      root.querySelector('[data-reset]')?.addEventListener('click', () => {
        closeSheet();
        mutate(() => db.clearOverride(room(), mid, iso), 'Auf Planung zurückgesetzt');
      });
      if (desk) bindGuest(root, desk.id, iso);
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
        mutate(() => db.addNote(room(), { title, text, color, author_id: me()?.id || null, author_name: me()?.name || '' }));
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
  state.data = { members: [], plans: [], overrides: [], guests: [], board: [] };
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
      <div class="brand-num big">552</div>
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
    <div class="brand-num big">552</div>
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
}

async function enterRoom() {
  state.unsubscribe?.();
  try {
    state.data = await db.load(room(), state.weekStart, addDays(state.weekStart, 6));
  } catch (err) {
    $('#dbbanner').hidden = false;
    return;
  }
  state.unsubscribe = db.subscribe(room(), scheduleReload);
  if (!me()) return showSetup('who', state.session.memberId ? 'Du bist in diesem Raum nicht mehr eingetragen. Bitte neu auswählen.' : '');
  delete document.body.dataset.setup;
  render();
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
    if (['kind', 'repeat'].includes(e.target.name)) syncPlanForm();
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
    mutate(() => db.savePlan(room(), plan), wasEdit ? 'Gespeichert' : 'Eingetragen');
  });

  const dlg = $('#sheet');
  dlg.addEventListener('close', () => (state.sheetOpen = false));
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
renderFurniture();
bind();
registerSW();
if (state.session?.room) enterRoom();
else showSetup('room');
