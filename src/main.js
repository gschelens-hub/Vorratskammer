import './styles.css';
import { api, AuthError, isDemo, LS } from './api.js';
import {
  addDays,
  formatShort,
  fromISO,
  isoWeek,
  MONTHS,
  mondayOf,
  todayBerlin,
  weekday,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
} from './shared/dates.js';
import { holidayName, isBridgeDay } from './shared/holidays.js';
import { PERSONS, planned, planMatches, resolveDay, STATUSES } from './shared/resolve.js';

// ---------- state ----------
const today0 = todayBerlin();
const state = {
  me: LS.get('552.me'),
  view: LS.get('552.view', 'room'),
  today: today0,
  weekStart: mondayOf(weekday(today0) >= 5 ? addDays(today0, 7 - weekday(today0)) : today0),
  selected: null,
  data: { plans: [], overrides: [], guests: [], board: [] },
  loading: false,
  sheetOpen: false,
  editPlanId: null,
};
state.selected = weekday(today0) >= 5 ? state.weekStart : today0;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const person = (id) => PERSONS.find((p) => p.id === id);
const weekDays = () => [0, 1, 2, 3, 4].map((i) => addDays(state.weekStart, i));

// ---------- data ----------
async function load({ quiet = false } = {}) {
  if (!quiet) state.loading = true;
  try {
    const d = await api.data(state.weekStart, addDays(state.weekStart, 6));
    state.data = d;
    if (d.today) state.today = d.today;
    render();
  } catch (err) {
    if (err instanceof AuthError) openSetup(err.message);
    else toast(err.message || 'Verbindung fehlgeschlagen');
  } finally {
    state.loading = false;
  }
}

async function mutate(fn, okMessage) {
  try {
    await fn();
    if (okMessage) toast(okMessage);
    await load({ quiet: true });
  } catch (err) {
    if (err instanceof AuthError) openSetup(err.message);
    else toast(err.message || 'Speichern fehlgeschlagen');
  }
}

const dayInfo = (pid, iso) => resolveDay(pid, iso, state.data.plans, state.data.overrides);
const guestFor = (desk, iso) => state.data.guests.find((g) => g.desk === desk && g.date === iso);

// ---------- rendering ----------
function render() {
  document.body.dataset.view = state.view;
  $('#tab-room').setAttribute('aria-selected', state.view === 'room');
  $('#tab-plan').setAttribute('aria-selected', state.view === 'plan');
  $('#me-chip').textContent = state.me ? person(state.me)?.name : 'Wer bist du?';
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
  const month =
    first.getUTCMonth() === last.getUTCMonth()
      ? `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`
      : `${MONTHS[first.getUTCMonth()].slice(0, 3)} – ${MONTHS[last.getUTCMonth()].slice(0, 3)} ${last.getUTCFullYear()}`;
  $('#cal-month').textContent = month;
  $('#cal-kw').textContent = `KW ${isoWeek(days[0])}`;
  $('#cal-today').hidden = days.includes(state.today);

  $('#cal-days').innerHTML = days
    .map((iso, i) => {
      const hol = holidayName(iso);
      const bridge = isBridgeDay(iso);
      const dots = PERSONS.map((p) => {
        const s = dayInfo(p.id, iso).status;
        return `<i class="dot" style="--c:${STATUSES[s].color}" title="${esc(p.name)}: ${STATUSES[s].label}"></i>`;
      }).join('');
      return `<button class="cal-day${iso === state.today ? ' is-today' : ''}${hol ? ' is-holiday' : ''}" data-day="${i}" role="tab" aria-selected="${iso === state.selected}" aria-label="${WEEKDAYS_LONG[i]} ${formatShort(iso)}${hol ? ', ' + esc(hol) : ''}">
        <span class="cal-wd">${WEEKDAYS_SHORT[i]}</span>
        <span class="cal-num">${fromISO(iso).getUTCDate()}</span>
        <span class="cal-dots">${dots}</span>
        ${hol ? `<span class="cal-tag">${esc(hol)}</span>` : bridge ? '<span class="cal-tag bridge">Brückentag</span>' : ''}
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

  $('#desks').innerHTML = PERSONS.map((p) => {
    const info = dayInfo(p.id, iso);
    const guest = guestFor(p.id, iso);
    const st = STATUSES[info.status];
    const note = info.note ? `<span class="desk-note">${esc(info.note)}</span>` : '';
    const guestTag = guest ? `<span class="desk-guest">Gast: ${esc(guest.guest_name)}</span>` : '';
    const src =
      info.source === 'override'
        ? info.overridden
          ? '<span class="desk-src" title="Für diesen Tag überschrieben">✎</span>'
          : ''
        : info.source === 'plan' || info.source === 'turnus'
          ? `<span class="desk-src" title="Aus der Planung">${info.source === 'turnus' ? '↻' : '▤'}</span>`
          : '';
    return `<button class="desk status-${info.status}${guest ? ' has-guest' : ''}${p.id === state.me ? ' is-me' : ''}"
        style="left:${p.x}%;top:${p.y}%;width:${p.w}%;height:${p.h}%;--c:${st.color}" data-person="${p.id}"
        aria-label="${esc(p.name)}: ${st.label}${info.note ? ', ' + esc(info.note) : ''}${guest ? ', Gast ' + esc(guest.guest_name) : ''}">
        <span class="desk-head"><span class="desk-name">${esc(p.name)}</span>${src}</span>
        <span class="desk-status">${guest && info.status !== 'office' ? '' : st.label}</span>
        ${guestTag}${note}
      </button>`;
  }).join('');
}

const NOTE_COLORS = { yellow: '#fff3a8', pink: '#ffd1dc', blue: '#cfe8ff', green: '#d4f5c9' };

function renderBoard() {
  const notes = state.data.board;
  const html =
    notes
      .map(
        (n, i) =>
          `<button class="sticky" data-note="${n.id}" style="--note:${NOTE_COLORS[n.color] || NOTE_COLORS.yellow};--r:${((i * 37) % 7) - 3}deg">
            <span class="sticky-text">${esc(n.text)}</span>${n.author ? `<span class="sticky-author">${esc(n.author)}</span>` : ''}
          </button>`,
      )
      .join('') + '<button class="sticky add" data-note-add aria-label="Notiz an die Pinnwand">+</button>';
  $('#board').innerHTML = html;
  $('#board-list').innerHTML = `<h3>Pinnwand</h3><div class="board-list-items">${html}</div>`;
}

function renderOverview() {
  const days = weekDays();
  const statusOf = (pid, iso) => dayInfo(pid, iso).status;
  const full = days.filter((iso) => PERSONS.every((p) => statusOf(p.id, iso) === 'office'));
  const kw = isoWeek(days[0]);
  let summary;
  if (full.length === 0) summary = `KW ${kw}: noch kein Tag, an dem alle drei im Büro sind.`;
  else if (full.length === 1) summary = `KW ${kw}: 1× komplett – am ${WEEKDAYS_LONG[weekday(full[0])]}.`;
  else summary = `KW ${kw}: ${full.length}× komplett – ${full.map((d) => WEEKDAYS_SHORT[weekday(d)]).join(', ')}.`;

  const hints = [];
  for (const iso of days) {
    if (!isBridgeDay(iso)) continue;
    const open = PERSONS.filter((p) => planned(p.id, iso, state.data.plans).source !== 'plan').map((p) => p.name);
    hints.push(
      `${WEEKDAYS_SHORT[weekday(iso)]} ${formatShort(iso)} ist Brückentag${
        open.length ? ` – noch kein Urlaub geplant: ${open.join(', ')}` : ''
      }.`,
    );
  }
  // look ahead 6 weeks for bridge days nobody has planned yet
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
  const rows = PERSONS.map((p) => {
    const cells = days
      .map((iso) => {
        const s = statusOf(p.id, iso);
        return `<td><span class="cell status-${s}" style="--c:${STATUSES[s].color}" title="${STATUSES[s].label}"></span></td>`;
      })
      .join('');
    const officeDays = days.filter((iso) => statusOf(p.id, iso) === 'office').length;
    return `<tr><th scope="row">${esc(p.name)}</th>${cells}<td class="count">${officeDays}×</td></tr>`;
  }).join('');
  const counts = days
    .map((iso) => `<td class="count">${PERSONS.filter((p) => statusOf(p.id, iso) === 'office').length}</td>`)
    .join('');

  $('#overview').innerHTML = `
    <h3>Wochenüberblick</h3>
    <p class="summary">${esc(summary)}</p>
    <table class="matrix">
      <thead><tr><th></th>${head}<th class="count" title="Bürotage">Büro</th></tr></thead>
      <tbody>${rows}<tr class="total"><th scope="row">im Büro</th>${counts}<td></td></tr></tbody>
    </table>
    ${hints.map((h) => `<p class="hint">${esc(h)}</p>`).join('')}
    <p class="legend">${Object.entries(STATUSES)
      .map(([, s]) => `<span><i class="dot" style="--c:${s.color}"></i>${s.label}</span>`)
      .join('')}<span>✎ überschrieben</span><span>▤ geplant</span><span>↻ Turnus</span></p>`;
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

function renderPlan() {
  const editing = state.data.plans.find((p) => p.id === state.editPlanId);
  const f = editing || {
    person: state.me || 'julia',
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
      ${PERSONS.map((p) => `<label><input type="radio" name="person" value="${p.id}"${p.id === f.person ? ' checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}
    </div>
    <div class="seg" role="radiogroup" aria-label="Art">
      ${Object.entries(KIND_LABEL).map(([k, l]) => `<label><input type="radio" name="kind" value="${k}"${k === f.kind ? ' checked' : ''}><span>${l}</span></label>`).join('')}
    </div>
    <div class="grid">
      <label>Status<select name="status">${['away', 'mobile', 'office'].map((s) => opt(s, f.status, STATUSES[s].label)).join('')}</select></label>
      <label class="k-absence k-single k-recurring"><span class="lbl-start">${f.kind === 'recurring' ? 'Gilt ab' : f.kind === 'single' ? 'Datum' : 'Von'}</span><input type="date" name="start_date" value="${f.start_date}" required></label>
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

  const sorted = [...state.data.plans].sort((a, b) => {
    const ra = a.kind === 'recurring' ? 1 : 0;
    const rb = b.kind === 'recurring' ? 1 : 0;
    return ra - rb || a.start_date.localeCompare(b.start_date);
  });
  const filter = LS.get('552.planFilter', 'all');
  $('#plan-filter').innerHTML = [['all', 'Alle'], ...PERSONS.map((p) => [p.id, p.name])]
    .map(([v, l]) => `<button data-filter="${v}" aria-pressed="${filter === v}">${esc(l)}</button>`)
    .join('');
  const visible = sorted.filter(
    (p) => (filter === 'all' || p.person === filter) && (p.kind === 'recurring' ? !p.end_date || p.end_date >= state.today : (p.end_date || p.start_date) >= state.today),
  );
  const past = sorted.length - sorted.filter((p) => (p.kind === 'recurring' ? !p.end_date || p.end_date >= state.today : (p.end_date || p.start_date) >= state.today)).length;
  $('#plan-list').innerHTML =
    (visible.length
      ? visible
          .map((p) => {
            const next = p.kind === 'recurring' ? nextDates(p) : [];
            return `<li class="plan-item" style="--c:${STATUSES[p.status].color}">
              <div class="plan-main">
                <span class="plan-who">${esc(person(p.person).name)}</span>
                <span class="plan-kind">${KIND_LABEL[p.kind]}${p.note ? ` · ${esc(p.note)}` : ''}</span>
                <span class="plan-when">${esc(describePlan(p))}</span>
                ${next.length ? `<span class="plan-next">Nächste: ${next.join(', ')}</span>` : ''}
              </div>
              <div class="plan-actions">
                <button class="btn small ghost" data-edit="${p.id}">Bearbeiten</button>
                <button class="btn small ghost danger" data-delete="${p.id}">Löschen</button>
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
  form.querySelectorAll('.k-absence, .k-single, .k-recurring').forEach((el) => {
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
    person: form.person.value,
    kind,
    status: form.status.value,
    note: form.note.value.trim(),
    start_date: form.start_date.value,
    end_date: null,
  };
  if (kind === 'absence') plan.end_date = form.end_date.value;
  if (kind === 'recurring') {
    plan.repeat = form.repeat.value;
    plan.weekday = Number(form.weekday.value);
    plan.interval = Number(form.interval.value);
    plan.nth = Number(form.nth.value);
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

function openDesk(pid) {
  const p = person(pid);
  const iso = state.selected;
  const info = dayInfo(pid, iso);
  const ov = state.data.overrides.find((o) => o.person === pid && o.date === iso);
  const base = info.base;
  const guest = guestFor(pid, iso);
  const baseText =
    base.source === 'plan' || base.source === 'turnus'
      ? `Laut Planung: ${STATUSES[base.status].label}${base.note ? ` (${esc(base.note)})` : ''}`
      : base.source === 'holiday'
        ? `Feiertag: ${esc(base.note)}`
        : 'Kein Planeintrag';

  openSheet(
    `<header class="sheet-head">
      <h2>${esc(p.name)} <small>· Tisch ${esc(p.desk)}</small></h2>
      <p>${WEEKDAYS_LONG[weekday(iso)]}, ${formatShort(iso)}${iso.slice(0, 4)}</p>
    </header>
    <div class="status-pick" role="radiogroup" aria-label="Status">
      ${['office', 'mobile', 'away']
        .map(
          (s) => `<button role="radio" aria-checked="${info.status === s}" data-status="${s}" style="--c:${STATUSES[s].color}">
            <i class="dot big" style="--c:${STATUSES[s].color}"></i>${STATUSES[s].label}</button>`,
        )
        .join('')}
    </div>
    <form class="note-form" data-note-form>
      <label>Notiz für diesen Tag<input name="note" maxlength="60" value="${esc(ov?.note ?? '')}" placeholder="${esc(base.note || 'z. B. ab 11 Uhr da')}"></label>
      <button class="btn" type="submit">Notiz speichern</button>
    </form>
    <p class="base-info">${baseText}${ov ? ' · <strong>für diesen Tag geändert</strong>' : ''}</p>
    ${ov ? '<button class="btn ghost" data-reset>Auf Planung zurücksetzen</button>' : ''}
    <section class="guest-box">
      <h3>Gastplatz</h3>
      ${
        guest
          ? `<p>Reserviert für <strong>${esc(guest.guest_name)}</strong>${guest.booked_by ? ` (von ${esc(guest.booked_by)})` : ''}.</p>
             ${info.status === 'office' ? `<p class="warn">Achtung: ${esc(p.name)} ist an diesem Tag selbst im Büro.</p>` : ''}
             <button class="btn ghost danger" data-guest-clear>Reservierung aufheben</button>`
          : info.status === 'office'
            ? `<p class="muted">${esc(p.name)} sitzt an diesem Tag selbst hier. Ein Gast kann reserviert werden, wenn der Tisch frei ist.</p>`
            : `<form class="guest-form" data-guest-form>
                <label>Tisch für einen Gast reservieren<input name="guest" maxlength="40" placeholder="Name des Gasts" required></label>
                <button class="btn" type="submit">Reservieren</button>
              </form>`
      }
    </section>`,
    (root) => {
      root.querySelectorAll('[data-status]').forEach((b) =>
        b.addEventListener('click', () => {
          const status = b.dataset.status;
          closeSheet();
          mutate(() => api.setOverride({ person: pid, date: iso, status, note: ov?.note ?? null }));
        }),
      );
      root.querySelector('[data-note-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const note = e.target.note.value.trim();
        closeSheet();
        if (!note && ov && !ov.status) mutate(() => api.clearOverride(pid, iso));
        else mutate(() => api.setOverride({ person: pid, date: iso, status: ov?.status ?? null, note: note || null }));
      });
      root.querySelector('[data-reset]')?.addEventListener('click', () => {
        closeSheet();
        mutate(() => api.clearOverride(pid, iso), 'Auf Planung zurückgesetzt');
      });
      root.querySelector('[data-guest-form]')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.target.guest.value.trim();
        if (!name) return;
        closeSheet();
        mutate(() => api.setGuest({ date: iso, desk: pid, guest_name: name, booked_by: person(state.me)?.name || '' }), 'Gastplatz reserviert');
      });
      root.querySelector('[data-guest-clear]')?.addEventListener('click', () => {
        closeSheet();
        mutate(() => api.clearGuest(iso, pid));
      });
    },
  );
}

function openNoteEditor() {
  openSheet(
    `<header class="sheet-head"><h2>Pinnwand</h2><p>Notiz fürs ganze Zimmer</p></header>
    <form data-board-form class="stack">
      <label>Text<textarea name="text" maxlength="140" rows="3" required placeholder="z. B. Drucker leer, Heizung spinnt"></textarea></label>
      <div class="seg colors" role="radiogroup" aria-label="Farbe">
        ${Object.entries(NOTE_COLORS)
          .map(([k, c], i) => `<label><input type="radio" name="color" value="${k}"${i === 0 ? ' checked' : ''}><span style="background:${c}" aria-label="${k}"></span></label>`)
          .join('')}
      </div>
      <button class="btn primary" type="submit">Anheften</button>
    </form>`,
    (root) => {
      root.querySelector('textarea').focus();
      root.querySelector('[data-board-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const text = e.target.text.value.trim();
        if (!text) return;
        const color = e.target.color.value;
        closeSheet();
        mutate(() => api.addNote({ text, color, author: person(state.me)?.name || '' }));
      });
    },
  );
}

function openNote(id) {
  const n = state.data.board.find((x) => x.id === id);
  if (!n) return;
  openSheet(
    `<div class="sticky big" style="--note:${NOTE_COLORS[n.color] || NOTE_COLORS.yellow};--r:0deg">
      <span class="sticky-text">${esc(n.text)}</span>${n.author ? `<span class="sticky-author">${esc(n.author)}</span>` : ''}
    </div>
    <div class="actions"><button class="btn ghost" data-close>Schließen</button><button class="btn primary" data-done>Erledigt – abnehmen</button></div>`,
    (root) => {
      root.querySelector('[data-close]').addEventListener('click', closeSheet);
      root.querySelector('[data-done]').addEventListener('click', () => {
        closeSheet();
        mutate(() => api.deleteNote(id));
      });
    },
  );
}

function openSetup(message = '') {
  openSheet(
    `<header class="sheet-head"><h2>Willkommen in 552</h2><p>Einmal einrichten, dann merkt sich das Gerät alles.</p></header>
    <form data-setup class="stack">
      ${isDemo ? '<p class="muted">Demo-Modus: Daten bleiben nur in diesem Browser.</p>' : `<label>Raum-PIN<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" value="${esc(LS.get('552.pin', ''))}" required></label>`}
      ${message ? `<p class="warn">${esc(message)}</p>` : ''}
      <fieldset><legend>Wer bist du?</legend><div class="seg">
        ${PERSONS.map((p) => `<label><input type="radio" name="me" value="${p.id}"${p.id === state.me ? ' checked' : ''} required><span>${esc(p.name)}</span></label>`).join('')}
      </div></fieldset>
      <button class="btn primary" type="submit">Los geht's</button>
    </form>`,
    (root) => {
      root.querySelector('[data-setup]').addEventListener('submit', (e) => {
        e.preventDefault();
        if (e.target.pin) LS.set('552.pin', e.target.pin.value.trim());
        state.me = e.target.me.value;
        LS.set('552.me', state.me);
        closeSheet();
        load();
      });
    },
  );
}

async function openSettings() {
  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && !isDemo;
  let sub = null;
  if (pushSupported) {
    const reg = await navigator.serviceWorker.getRegistration();
    sub = reg ? await reg.pushManager.getSubscription() : null;
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  openSheet(
    `<header class="sheet-head"><h2>Einstellungen</h2></header>
    <fieldset><legend>Ich bin</legend><div class="seg" data-me>
      ${PERSONS.map((p) => `<label><input type="radio" name="me" value="${p.id}"${p.id === state.me ? ' checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}
    </div></fieldset>
    <section class="guest-box">
      <h3>Morgen-Erinnerung</h3>
      <p class="muted">Werktags um 8:30 Uhr: „Bist du heute im Büro?“ – nur wenn für den Tag noch nichts eingetragen oder geplant ist. Antworten direkt aus der Mitteilung (Android/Desktop).</p>
      ${
        !pushSupported
          ? `<p class="warn">${isDemo ? 'Im Demo-Modus nicht verfügbar.' : 'Dieser Browser unterstützt keine Mitteilungen.'}</p>`
          : isIOS && !standalone
            ? '<p class="warn">Auf dem iPhone zuerst über „Teilen → Zum Home-Bildschirm“ installieren und die App von dort öffnen.</p>'
            : sub
              ? '<div class="actions"><button class="btn ghost" data-push-test>Test senden</button><button class="btn ghost danger" data-push-off>Ausschalten</button></div>'
              : '<button class="btn primary" data-push-on>Erinnerung einschalten</button>'
      }
    </section>
    <div class="actions">
      ${isDemo ? '<button class="btn ghost danger" data-demo-off>Demo beenden</button>' : '<button class="btn ghost" data-pin>PIN ändern</button>'}
      <button class="btn" data-close>Fertig</button>
    </div>`,
    (root) => {
      root.querySelectorAll('[data-me] input').forEach((i) =>
        i.addEventListener('change', () => {
          state.me = i.value;
          LS.set('552.me', state.me);
          render();
        }),
      );
      root.querySelector('[data-close]').addEventListener('click', closeSheet);
      root.querySelector('[data-pin]')?.addEventListener('click', () => openSetup());
      root.querySelector('[data-demo-off]')?.addEventListener('click', () => {
        LS.set('552.demo', null);
        LS.set('552.demoData', null);
        location.href = location.pathname;
      });
      root.querySelector('[data-push-on]')?.addEventListener('click', enablePush);
      root.querySelector('[data-push-off]')?.addEventListener('click', async () => {
        await api.pushUnsubscribe(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
        toast('Erinnerung ausgeschaltet');
        openSettings();
      });
      root.querySelector('[data-push-test]')?.addEventListener('click', async () => {
        try {
          const r = await api.pushTest(sub.endpoint);
          toast(r.sent ? 'Test gesendet' : 'Senden fehlgeschlagen');
        } catch (err) {
          toast(err.message);
        }
      });
    },
  );
}

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function enablePush() {
  try {
    if (!state.me) return openSetup('Bitte zuerst auswählen, wer du bist.');
    const { publicKey } = await api.pushKey();
    if (!publicKey) return toast('Mitteilungen sind auf dem Server noch nicht eingerichtet.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Mitteilungen wurden nicht erlaubt.');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
    await api.pushSubscribe(state.me, sub.toJSON());
    toast('Erinnerung ist an');
    openSettings();
  } catch (err) {
    toast(err.message || 'Einschalten fehlgeschlagen');
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
  load({ quiet: true });
}

function goToday() {
  const t = state.today;
  state.weekStart = mondayOf(weekday(t) >= 5 ? addDays(t, 7 - weekday(t)) : t);
  state.selected = weekday(t) >= 5 ? state.weekStart : t;
  render();
  load({ quiet: true });
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
  $('#cal-prev').addEventListener('click', () => shiftWeek(-1));
  $('#cal-next').addEventListener('click', () => shiftWeek(1));
  $('#cal-today').addEventListener('click', goToday);

  // red slider: tap a day or drag the slider along the strip
  const strip = $('#cal-days');
  let drag = null;
  strip.addEventListener('pointerdown', (e) => {
    const rect = strip.getBoundingClientRect();
    drag = { rect, startX: e.clientX, moved: false, id: e.pointerId };
  });
  strip.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.abs(e.clientX - drag.startX) < 6) return;
    if (!drag.moved) strip.setPointerCapture(e.pointerId);
    drag.moved = true;
    const cell = drag.rect.width / 5;
    const x = Math.min(Math.max(e.clientX - drag.rect.left - cell / 2, 0), cell * 4);
    moveSlider(0, x);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const cell = drag.rect.width / 5;
    const idx = Math.min(4, Math.max(0, Math.floor((e.clientX - drag.rect.left) / cell)));
    const moved = drag.moved;
    drag = null;
    if (moved || e.type === 'pointerup') selectDay(weekDays()[idx]);
  };
  strip.addEventListener('pointerup', endDrag);
  strip.addEventListener('pointercancel', (e) => {
    drag = null;
    moveSlider(Math.max(0, weekDays().indexOf(state.selected)));
    void e;
  });
  strip.addEventListener('keydown', (e) => {
    const idx = weekDays().indexOf(state.selected);
    if (e.key === 'ArrowRight') {
      if (idx < 4) selectDay(weekDays()[idx + 1]);
      else shiftWeek(1);
    } else if (e.key === 'ArrowLeft') {
      if (idx > 0) selectDay(weekDays()[idx - 1]);
      else shiftWeek(-1);
    } else return;
    e.preventDefault();
    requestAnimationFrame(() => $(`#cal-days [aria-selected="true"]`)?.focus());
  });

  // swipe on the room image changes the week
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
    const desk = e.target.closest('[data-person]');
    if (desk) return openDesk(desk.dataset.person);
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
      if (confirm('Eintrag wirklich löschen?')) mutate(() => api.deletePlan(del.dataset.delete), 'Gelöscht');
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
    if (e.target.name === 'start_date' && $('#plan-form').end_date.value < e.target.value) {
      $('#plan-form').end_date.value = e.target.value;
    }
  });
  $('#plan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const plan = readPlanForm();
    if (plan.kind === 'absence' && plan.end_date < plan.start_date) return toast('Das Enddatum liegt vor dem Start.');
    const wasEdit = Boolean(state.editPlanId);
    state.editPlanId = null;
    mutate(() => api.savePlan(plan), wasEdit ? 'Gespeichert' : 'Eingetragen');
  });

  const dlg = $('#sheet');
  dlg.addEventListener('close', () => (state.sheetOpen = false));
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg && state.me) closeSheet();
  });
  dlg.addEventListener('cancel', (e) => {
    if (!state.me) e.preventDefault();
  });

  // refresh regularly so changes from the others show up
  setInterval(() => {
    if (document.visibilityState === 'visible' && !state.sheetOpen) load({ quiet: true });
  }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const t = todayBerlin();
      if (t !== state.today) {
        state.today = t;
        goToday();
      } else load({ quiet: true });
    }
  });
}

// ---------- start ----------
bind();
render();
if (!state.me || (!isDemo && !LS.get('552.pin'))) openSetup();
else load();

if ('serviceWorker' in navigator && !isDemo) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
