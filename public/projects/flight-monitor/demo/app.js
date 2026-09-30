'use strict';

// ── State ────────────────────────────────────────────────────────────────────

let cashFlights  = [];
let awardFlights = [];
let cashShown    = 10;
let awardShown   = 10;
let activeTab    = 'cash';

// $, esc, and setupAutocomplete come from common.js

// ── Swap ─────────────────────────────────────────────────────────────────────

$('swapBtn').addEventListener('click', () => {
  const fi = $('fromInput'), ti = $('toInput');
  const fc = $('fromCode'),  tc = $('toCode');
  [fi.value, ti.value] = [ti.value, fi.value];
  [fc.value, tc.value] = [tc.value, fc.value];
});

// ── Search ───────────────────────────────────────────────────────────────────

$('searchForm').addEventListener('submit', async e => {
  e.preventDefault();

  const origin      = $('fromCode').value.trim().toUpperCase();
  const destination = $('toCode').value.trim().toUpperCase();
  const date        = $('dateInput').value;
  const returnDate  = $('returnInput').value;
  const cabin       = $('cabinSelect').value;

  if (!origin) {
    showError('Please select a valid origin airport from the dropdown.');
    return;
  }
  if (!destination) {
    showError('Please select a valid destination airport from the dropdown.');
    return;
  }
  if (returnDate && returnDate < date) {
    showError('Return date must be on or after the departure date.');
    return;
  }
  if (!date) {
    showError('Please choose a departure date.');
    return;
  }

  showLoading();

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, date, cabin, return_date: returnDate || null }),
    });
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Search failed. Please try again.'); return; }
    displayResults(data);
  } catch {
    showError('Network error. Please check your connection and try again.');
  }
});

// ── Display ───────────────────────────────────────────────────────────────────

function showLoading() {
  $('results').classList.add('hidden');
  $('error').classList.add('hidden');
  $('loading').classList.remove('hidden');
}

function showError(msg) {
  $('loading').classList.add('hidden');
  $('results').classList.add('hidden');
  $('errorMsg').textContent = msg;
  $('error').classList.remove('hidden');
}

function displayResults(data) {
  $('loading').classList.add('hidden');
  $('error').classList.add('hidden');

  cashFlights  = data.cash  || [];
  awardFlights = data.award || [];
  cashShown    = 10;
  awardShown   = 10;

  const cabinLabel = { economy: 'Economy', premium_economy: 'Premium Economy', business: 'Business', first: 'First' }[data.cabin] || data.cabin;
  $('routeInfo').textContent = data.return_date
    ? `${data.origin} ⇄ ${data.destination}  ·  ${fmtDate(data.date)} – ${fmtDate(data.return_date)}  ·  ${cabinLabel}  ·  round-trip totals`
    : `${data.origin} → ${data.destination}  ·  ${fmtDate(data.date)}  ·  ${cabinLabel}`;

  $('cashCount').textContent  = cashFlights.length;
  $('awardCount').textContent = awardFlights.length;

  renderTab('cash');
  renderTab('award');

  // Default to cash tab if it has results; otherwise award
  switchTab(cashFlights.length > 0 ? 'cash' : 'award');

  $('results').classList.remove('hidden');
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTab(type) {
  const flights = type === 'cash' ? cashFlights : awardFlights;
  const shown   = type === 'cash' ? cashShown   : awardShown;
  const listEl  = $(type === 'cash' ? 'cashList'       : 'awardList');
  const pagEl   = $(type === 'cash' ? 'cashPagination' : 'awardPagination');

  listEl.innerHTML = '';

  if (!flights.length) {
    listEl.innerHTML =
      `<div class="empty-state">` +
        `<h3>No ${type === 'award' ? 'award' : 'cash'} fares found</h3>` +
        `<p>Try adjusting your dates or nearby airports.</p>` +
      `</div>`;
    pagEl.innerHTML = '';
    return;
  }

  flights.slice(0, shown).forEach(f => listEl.appendChild(buildCard(f)));
  renderPagination(pagEl, flights.length, shown, type);
}

function renderPagination(el, total, shown, type) {
  el.innerHTML = '';
  const visible = Math.min(shown, total);

  const info = document.createElement('span');
  info.className   = 'pagination-info';
  info.textContent = `Showing ${visible} of ${total} result${total !== 1 ? 's' : ''}`;
  el.appendChild(info);

  if (visible < total) {
    const moreBtn = document.createElement('button');
    moreBtn.className   = 'btn-more';
    moreBtn.textContent = `Show ${Math.min(10, total - shown)} more`;
    moreBtn.addEventListener('click', () => {
      if (type === 'cash') cashShown  += 10;
      else                 awardShown += 10;
      renderTab(type);
    });
    el.appendChild(moreBtn);

    const allBtn = document.createElement('button');
    allBtn.className   = 'btn-all';
    allBtn.textContent = `Show all ${total}`;
    allBtn.addEventListener('click', () => {
      if (type === 'cash') cashShown  = total;
      else                 awardShown = total;
      renderTab(type);
    });
    el.appendChild(allBtn);
  }
}

// ── Card builder ─────────────────────────────────────────────────────────────

function buildCard(f) {
  const card = document.createElement('div');
  card.className = `flight-card${f.type === 'award' ? ' award-card' : ''}`;

  const airlineName = f.airline || (f.type === 'award' ? sourceToAirline(f.source) : 'Unknown Airline');
  const dep = fmtTime(f.departure_time);
  const arr = fmtTime(f.arrival_time);
  const hasTimings = dep && arr;

  // ── Airline column ──────────────────────────────────────────────────────
  const airlineCol = document.createElement('div');
  airlineCol.className = 'card-airline';
  airlineCol.innerHTML =
    `<div class="airline-name">${esc(airlineName)}</div>` +
    (f.flight_number ? `<div class="flight-num">${esc(f.flight_number)}</div>` : '') +
    `<div class="card-tags">` +
      (f.type === 'award'             ? `<span class="tag tag-award">Award</span>` : '') +
      (f.is_virtual_interlining       ? `<span class="tag tag-vi">Self-transfer</span>` : '') +
      `<span class="tag tag-source">${esc(fmtSource(f.source))}</span>` +
    `</div>`;

  // ── Times column ────────────────────────────────────────────────────────
  const timesCol = document.createElement('div');
  timesCol.className = 'card-times';

  if (hasTimings) {
    timesCol.innerHTML =
      `<div class="time-block">` +
        `<div class="time">${esc(dep)}</div>` +
        `<div class="time-airport">${esc(f.origin)}</div>` +
      `</div>` +
      `<div class="route-line">` +
        (f.duration ? `<div class="duration">${esc(String(f.duration))}</div>` : '') +
        `<div class="line-bar"></div>` +
        (f.stops !== null && f.stops !== undefined
          ? `<div class="stops-label ${stopsClass(f.stops)}">${esc(stopsLabel(f.stops))}</div>`
          : '') +
      `</div>` +
      `<div class="time-block">` +
        `<div class="time">${esc(arr)}</div>` +
        `<div class="time-airport">${esc(f.destination)}</div>` +
      `</div>`;
  } else if (f.type === 'award') {
    // Award fares from seats.aero — no flight times available
    timesCol.innerHTML =
      `<div class="award-details">` +
        `<strong>${esc(f.origin)}</strong> → <strong>${esc(f.destination)}</strong><br>` +
        (f.date ? `Departs ${esc(fmtDate(f.date))}` : '') +
      `</div>`;
  } else {
    timesCol.innerHTML =
      `<div class="award-details">` +
        `<strong>${esc(f.origin)}</strong> → <strong>${esc(f.destination)}</strong>` +
        (f.duration ? `<br>${esc(String(f.duration))}` : '') +
        (f.stops !== null && f.stops !== undefined
          ? `&nbsp;·&nbsp;<span class="stops-label ${stopsClass(f.stops)}">${esc(stopsLabel(f.stops))}</span>`
          : '') +
      `</div>`;
  }

  // ── Price column ─────────────────────────────────────────────────────────
  const priceCol = document.createElement('div');
  priceCol.className = 'card-price';

  if (f.type === 'award') {
    const pts = f.points != null ? Number(f.points).toLocaleString() : '—';
    priceCol.innerHTML =
      `<div class="price-amount award-price">${esc(pts)}<span class="price-unit"> pts</span></div>` +
      `<div class="price-note">+ taxes &amp; fees</div>`;
  } else {
    const usd = f.price != null ? '$' + Number(f.price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
    priceCol.innerHTML = `<div class="price-amount">${esc(usd)}</div>`;
  }

  // ── Actions column ────────────────────────────────────────────────────────
  const actionsCol = document.createElement('div');
  actionsCol.className = 'card-actions';
  if (f.deep_link) {
    const link = document.createElement('a');
    link.className  = 'deep-link-btn';
    link.href       = f.deep_link;
    link.target     = '_blank';
    link.rel        = 'noopener noreferrer';
    link.textContent = 'View';
    actionsCol.appendChild(link);
  }

  card.appendChild(airlineCol);
  card.appendChild(timesCol);
  card.appendChild(priceCol);
  card.appendChild(actionsCol);

  return card;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

function switchTab(type) {
  activeTab = type;
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === type)
  );
  $('cashResults').classList.toggle('hidden',  type !== 'cash');
  $('awardResults').classList.toggle('hidden', type !== 'award');
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtTime(t) {
  if (!t) return null;
  const s = String(t).trim();

  // Already has AM/PM  e.g.  "9:00 AM"
  if (/\d:\d{2}\s*(AM|PM)/i.test(s)) return s;

  // 24-hour with optional seconds  e.g.  "14:30" or "14:30:00"
  const hhmm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) {
    let h = parseInt(hhmm[1], 10);
    const m = hhmm[2];
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${suffix}`;
  }

  // ISO datetime  e.g.  "2024-03-15T09:00:00"
  if (s.includes('T') || (s.includes('-') && s.length > 10)) {
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
    } catch { /* fall through */ }
  }

  return s || null;
}

function stopsLabel(stops) {
  if (stops === null || stops === undefined) return '';
  if (typeof stops === 'string') {
    if (/nonstop/i.test(stops)) return 'Nonstop';
    return stops;
  }
  if (stops === 0) return 'Nonstop';
  if (stops === 1) return '1 stop';
  return `${stops} stops`;
}

function stopsClass(stops) {
  if (stops === null || stops === undefined) return '';
  const n = typeof stops === 'string'
    ? (/nonstop/i.test(stops) ? 0 : parseInt(stops) || 1)
    : stops;
  if (n === 0) return 'nonstop';
  if (n === 1) return 'one-stop';
  return 'multi-stop';
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    // Force local time by appending T00:00:00 so no TZ shift
    const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

const _SOURCE_LABELS = {
  google_flights:          'Google Flights',
  'google_flights+serpapi':'Google Flights',
  serpapi:                 'SerpApi',
};

function fmtSource(src) {
  if (!src) return '';
  if (_SOURCE_LABELS[src]) return _SOURCE_LABELS[src];
  if (src.startsWith('seats.aero/')) return 'seats.aero';
  return src;
}

const _AIRLINE_MAP = {
  AA: 'American Airlines', DL: 'Delta Air Lines',   UA: 'United Airlines',
  WN: 'Southwest Airlines', B6: 'JetBlue',          AS: 'Alaska Airlines',
  F9: 'Frontier Airlines',  NK: 'Spirit Airlines',  HA: 'Hawaiian Airlines',
  G4: 'Allegiant Air',      SY: 'Sun Country',      MX: 'Breeze Airways',
  AC: 'Air Canada',         WS: 'WestJet',          BA: 'British Airways',
  AF: 'Air France',         KL: 'KLM',              LH: 'Lufthansa',
  LX: 'SWISS',              OS: 'Austrian Airlines', IB: 'Iberia',
  VY: 'Vueling',            U2: 'easyJet',           FR: 'Ryanair',
  EK: 'Emirates',           QR: 'Qatar Airways',     EY: 'Etihad Airways',
  MS: 'EgyptAir',           ET: 'Ethiopian Airlines', KQ: 'Kenya Airways',
  SQ: 'Singapore Airlines', CX: 'Cathay Pacific',   TG: 'Thai Airways',
  MH: 'Malaysia Airlines',  GA: 'Garuda Indonesia',  QF: 'Qantas',
  NZ: 'Air New Zealand',    JL: 'Japan Airlines',   NH: 'ANA',
  OZ: 'Asiana Airlines',    KE: 'Korean Air',
  CA: 'Air China',          MU: 'China Eastern',    CZ: 'China Southern',
  CI: 'China Airlines',     BR: 'EVA Air',           TR: 'Scoot',
  VS: 'Virgin Atlantic',    TK: 'Turkish Airlines',  RO: 'TAROM',
  AZ: 'ITA Airways',
};

function sourceToAirline(src) {
  if (!src) return 'Unknown';
  const parts = src.split('/');
  if (parts.length >= 2) {
    const code = parts[1].toUpperCase();
    return _AIRLINE_MAP[code] || `${code} (award)`;
  }
  return src;
}


// ── Init ─────────────────────────────────────────────────────────────────────

setupAutocomplete('fromInput', 'fromDropdown', 'fromCode');
setupAutocomplete('toInput',   'toDropdown',   'toCode');

// Default date = tomorrow
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const pad = n => String(n).padStart(2, '0');
$('dateInput').value = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
$('dateInput').min   = new Date().toISOString().split('T')[0];
$('returnInput').min = $('dateInput').value;
$('dateInput').addEventListener('change', () => {
  $('returnInput').min = $('dateInput').value;
  if ($('returnInput').value && $('returnInput').value < $('dateInput').value) {
    $('returnInput').value = $('dateInput').value;
  }
});
