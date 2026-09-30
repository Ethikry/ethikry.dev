'use strict';

// $, esc, and setupAutocomplete come from common.js

let PROGRAMS = [];

// ── Init ─────────────────────────────────────────────────────────────────────

setupAutocomplete('fromInput', 'fromDropdown', 'fromCode');
setupAutocomplete('toInput',   'toDropdown',   'toCode');

$('swapBtn').addEventListener('click', () => {
  const fi = $('fromInput'), ti = $('toInput');
  const fc = $('fromCode'),  tc = $('toCode');
  [fi.value, ti.value] = [ti.value, fi.value];
  [fc.value, tc.value] = [tc.value, fc.value];
});

// Keep the range coherent: picking an earliest date pushes the latest forward.
$('dateFrom').addEventListener('change', () => {
  const from = $('dateFrom').value;
  const to   = $('dateTo');
  to.min = from;
  if (from && (!to.value || to.value < from)) to.value = from;
});

init();

async function init() {
  await loadPrograms();
  await loadWatches();
}

// ── Programs ─────────────────────────────────────────────────────────────────

async function loadPrograms() {
  try {
    const res = await fetch('/api/programs');
    PROGRAMS = await res.json();
  } catch {
    PROGRAMS = [];
  }
  renderProgramGrid();
}

function renderProgramGrid() {
  const grid = $('programGrid');
  grid.innerHTML = '';
  PROGRAMS.forEach(p => {
    const label = document.createElement('label');
    label.className = 'program-item';
    label.innerHTML =
      `<input type="checkbox" value="${esc(p.slug)}" data-alliance="${esc(p.alliance || '')}">` +
      `<span class="program-name">${esc(p.name)}</span>`;
    grid.appendChild(label);
  });
}

document.querySelectorAll('.chip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode  = btn.dataset.select;
    const boxes = [...document.querySelectorAll('#programGrid input[type=checkbox]')];
    boxes.forEach(b => {
      if (mode === 'all')       b.checked = true;
      else if (mode === 'none') b.checked = false;
      else                      b.checked = b.dataset.alliance === mode;
    });
  });
});

function selectedPrograms() {
  return [...document.querySelectorAll('#programGrid input:checked')].map(b => b.value);
}

// ── Create ───────────────────────────────────────────────────────────────────

$('watchForm').addEventListener('submit', async e => {
  e.preventDefault();
  hideError();

  const origin      = $('fromCode').value.trim().toUpperCase();
  const destination = $('toCode').value.trim().toUpperCase();
  const dateFrom    = $('dateFrom').value;
  const dateTo      = $('dateTo').value || dateFrom;

  if (!origin || !destination) return showError('Pick an origin and destination from the dropdown.');
  if (origin === destination)  return showError('Origin and destination must differ.');
  if (!dateFrom)               return showError('Pick at least an earliest date.');
  if (dateTo < dateFrom)       return showError('Latest date must be on or after the earliest date.');

  // Blank = one-way. Any value is a trip length in days: each departure date is
  // priced with a return that many days later, so the fare covers both legs.
  const tripLength = intOrNull($('tripLength').value);
  if (tripLength !== null && tripLength < 1) {
    return showError('Trip length must be at least 1 day, or blank for one-way.');
  }

  const body = {
    origin, destination,
    date_from: dateFrom,
    date_to:   dateTo,
    cabin:     $('cabinSelect').value,
    programs:  selectedPrograms(),
    include_cash: $('includeCash').checked,
    return_offset_days: tripLength,
    target_points:   intOrNull($('targetPoints').value),
    target_cash_usd: floatOrNull($('targetCash').value),
    poll_interval_minutes: intOrNull($('pollInterval').value),
    label: $('labelInput').value.trim() || null,
  };

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const res  = await fetch('/api/watches', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Could not create watch.'); return; }
    $('watchForm').reset();
    renderProgramGrid();
    await loadWatches();
  } catch {
    showError('Network error. Is the server running?');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create watch';
  }
});

function intOrNull(v)   { const n = parseInt(v, 10);  return Number.isFinite(n) ? n : null; }
function floatOrNull(v) { const n = parseFloat(v);    return Number.isFinite(n) ? n : null; }

// ── List ─────────────────────────────────────────────────────────────────────

async function loadWatches() {
  let watches = [];
  try {
    const res = await fetch('/api/watches');
    watches   = await res.json();
  } catch {
    showError('Could not load watches.');
    return;
  }

  const list = $('watchList');
  list.innerHTML = '';
  $('emptyState').classList.toggle('hidden', watches.length > 0);

  watches.forEach(w => list.appendChild(renderWatch(w)));
}

function renderWatch(w) {
  const card = document.createElement('div');
  card.className = 'watch-card';

  const dates = w.date_from === w.date_to
    ? w.date_from
    : `${w.date_from} → ${w.date_to}`;

  const programs = w.programs.length
    ? w.programs.map(slug => {
        const p = PROGRAMS.find(x => x.slug === slug);
        return esc(p ? p.name : slug);
      }).join(', ')
    : 'All programs';

  const targets = [];
  if (w.target_points)   targets.push(`${w.target_points.toLocaleString()} pts`);
  if (w.target_cash_usd) targets.push(`$${w.target_cash_usd.toLocaleString()}`);

  const checked = w.last_checked_at
    ? new Date(w.last_checked_at).toLocaleString()
    : 'never';

  card.innerHTML =
    `<div class="watch-main">` +
      `<div class="watch-route">${esc(w.origin)} → ${esc(w.destination)}` +
        (w.label ? `<span class="watch-label">${esc(w.label)}</span>` : '') +
      `</div>` +
      `<div class="watch-meta">` +
        `<span>${esc(dates)}</span>` +
        `<span>${esc(cabinLabel(w.cabin))}</span>` +
        `<span>${w.include_cash ? 'Award + cash' : 'Award only'}</span>` +
        `<span>${w.return_offset_days ? `round trip · ${w.return_offset_days}d` : 'one-way'}</span>` +
        `<span>every ${w.poll_interval_minutes}m</span>` +
      `</div>` +
      `<div class="watch-programs">${programs}</div>` +
      (targets.length ? `<div class="watch-target">Target: ${esc(targets.join(' / '))}</div>` : '') +
      `<div class="watch-checked">Last checked: ${esc(checked)}</div>` +
    `</div>` +
    `<div class="watch-actions">` +
      `<button class="chip-btn" data-act="poll">Check now</button>` +
      `<button class="chip-btn" data-act="history">History</button>` +
      `<button class="chip-btn danger" data-act="delete">Delete</button>` +
    `</div>` +
    `<div class="watch-history hidden"></div>`;

  card.querySelector('[data-act=poll]').addEventListener('click', ev => pollNow(w.id, ev.target));
  card.querySelector('[data-act=history]').addEventListener('click', () => toggleHistory(w.id, card));
  card.querySelector('[data-act=delete]').addEventListener('click', () => removeWatch(w.id));
  return card;
}

function cabinLabel(c) {
  return ({
    economy: 'Economy',
    premium_economy: 'Premium Economy',
    business: 'Business',
    first: 'First',
  })[c] || c;
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function pollNow(id, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const res  = await fetch(`/api/watches/${id}/poll`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Poll failed.'); return; }
    btn.textContent = data.alerts.length
      ? `${data.alerts.length} alert(s)`
      : 'No change';
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
    await loadWatches();
  } catch {
    showError('Network error during poll.');
    btn.textContent = original;
    btn.disabled = false;
  }
}

async function toggleHistory(id, card) {
  const panel = card.querySelector('.watch-history');
  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    return;
  }

  panel.innerHTML = '<p class="hint">Loading…</p>';
  panel.classList.remove('hidden');

  try {
    const res  = await fetch(`/api/watches/${id}/history`);
    const data = await res.json();
    panel.innerHTML = renderHistory(data.observations);
  } catch {
    panel.innerHTML = '<p class="hint">Could not load history.</p>';
  }
}

function renderHistory(obs) {
  if (!obs.length) return '<p class="hint">No observations yet — run a check.</p>';

  // Cheapest per (date, kind) so the table shows the tracked figure, not noise.
  const best = new Map();
  obs.forEach(o => {
    const price = o.kind === 'award' ? o.points : o.cash_usd;
    if (price == null) return;
    const key = `${o.depart_date}|${o.kind}`;
    const cur = best.get(key);
    if (!cur || price < cur.price) best.set(key, { ...o, price });
  });

  const rows = [...best.values()]
    .sort((a, b) => a.depart_date.localeCompare(b.depart_date) || a.kind.localeCompare(b.kind))
    .map(o => {
      const price = o.kind === 'award'
        ? `${o.points.toLocaleString()} pts`
        : `$${o.cash_usd.toLocaleString()}`;
      const taxes = o.taxes != null ? `${o.taxes.toFixed(2)} ${esc(o.taxes_currency || 'USD')}` : '—';
      return `<tr>` +
        `<td>${esc(o.depart_date)}</td>` +
        `<td>${esc(o.kind)}</td>` +
        `<td>${esc(o.program)}</td>` +
        `<td class="num">${price}</td>` +
        `<td class="num">${taxes}</td>` +
        `<td class="num">${o.seats_remaining ?? '—'}</td>` +
        `<td>${o.nonstop ? 'Nonstop' : '—'}</td>` +
      `</tr>`;
    }).join('');

  return `<table class="history-table">` +
    `<thead><tr><th>Date</th><th>Type</th><th>Program</th><th class="num">Best</th>` +
    `<th class="num">Taxes</th><th class="num">Seats</th><th>Routing</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
}

async function removeWatch(id) {
  // No confirm() — a browser modal blocks the page and is easy to mis-click.
  try {
    const res = await fetch(`/api/watches/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      showError(data.error || 'Could not delete watch.');
      return;
    }
    await loadWatches();
  } catch {
    showError('Network error while deleting.');
  }
}

// ── Errors ───────────────────────────────────────────────────────────────────

function showError(msg) {
  $('formErrorText').textContent = msg;
  $('formError').classList.remove('hidden');
}

function hideError() {
  $('formError').classList.add('hidden');
}
