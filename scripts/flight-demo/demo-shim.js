'use strict';
// flight-monitor demo: stands in for the FastAPI backend so the project's real
// pages (index.html, watches.html and their scripts, copied unchanged) run as a
// static site. Every /api/* request is answered here from fixtures.json, which
// was produced by running synthetic fares through the real alert engine.
// Changes (new watches, deletes, "Check now") live in memory for the visit.
(() => {
  const BASE = '/projects/flight-monitor/demo/';
  const realFetch = window.fetch.bind(window);
  const load = (f) => realFetch(BASE + f).then((r) => r.json());
  const ready = Promise.all([load('fixtures.json'), load('airports.json'), load('programs.json')]).then(
    ([fx, airports, programs]) => ({
      watches: fx.watches,
      history: new Map(fx.history.map((h) => [h.watch_id, h.observations])),
      nextPoll: new Map(Object.entries(fx.next_poll).map(([k, v]) => [Number(k), v])),
      airports: airports.airports,
      programs: programs.programs,
    }),
  );

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // web/app.py _search_airports, ported.
  function searchAirports(airports, query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hit = airports.filter(
      (a) =>
        a.iata.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.country || '').toLowerCase().includes(q),
    );
    const score = (a) => {
      const iata = a.iata.toLowerCase(), city = a.city.toLowerCase(), name = a.name.toLowerCase();
      if (iata === q) return 0;
      if (city === q) return 1;
      if (city.startsWith(q)) return 2;
      if (iata.startsWith(q)) return 3;
      if (name.startsWith(q)) return 4;
      return 5;
    };
    return hit.sort((a, b) => score(a) - score(b)).slice(0, 8);
  }

  // Deterministic fake fares for any route, so searches give stable answers.
  function rng(seedStr) {
    let h = 2166136261;
    for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 100000) / 100000;
  }
  function haversine(a, b) {
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  const CARRIERS = [['UA', 'United'], ['DL', 'Delta'], ['AA', 'American'], ['AS', 'Alaska'], ['B6', 'JetBlue'], ['WN', 'Southwest'], ['AC', 'Air Canada'], ['BA', 'British Airways'], ['LH', 'Lufthansa'], ['JL', 'JAL']];
  const CABIN_X = { economy: 1, premium_economy: 1.7, business: 3.6, first: 5.5 };

  function search(state, req) {
    const o = state.airports.find((a) => a.iata === req.origin);
    const d = state.airports.find((a) => a.iata === req.destination);
    if (!o || !d) return json({ error: 'Unknown airport code' }, 400);
    if (req.return_date && req.return_date < req.date) return json({ error: 'Return date must be on or after the departure date' }, 400);
    const r = rng(`${req.origin}${req.destination}${req.date}${req.cabin}${req.return_date || ''}`);
    const km = Math.max(300, haversine(o, d));
    const x = CABIN_X[req.cabin] || 1;
    const cash = [];
    const n = 6 + Math.floor(r() * 10);
    for (let i = 0; i < n; i++) {
      const [code, name] = CARRIERS[Math.floor(r() * CARRIERS.length)];
      const stops = km < 1500 ? (r() < 0.7 ? 0 : 1) : r() < 0.35 ? 0 : 1 + Math.floor(r() * 2);
      const mins = Math.round((km / 780) * 60 + 35 + stops * (70 + r() * 150));
      const dep = 6 * 60 + Math.floor(r() * 15 * 60);
      const arr = (dep + mins) % (24 * 60);
      const t = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const price = Math.round((70 + km * 0.09 * x) * (0.8 + r() * 0.7) * (stops ? 0.88 : 1) * (req.return_date ? 1.8 : 1));
      cash.push({
        type: 'cash', origin: req.origin, destination: req.destination, date: req.date, return_date: req.return_date,
        cabin: req.cabin, price, points: null, program: 'google_flights', source: 'google_flights',
        airline: name, flight_number: `${code} ${100 + Math.floor(r() * 2800)}`,
        departure_time: t(dep), arrival_time: t(arr), duration: `${Math.floor(mins / 60)}h ${mins % 60}m`,
        stops, nonstop: stops === 0, deep_link: null, is_virtual_interlining: false,
      });
    }
    const award = [];
    const progs = state.programs.slice().sort(() => r() - 0.5).slice(0, 4 + Math.floor(r() * 4));
    for (const p of progs) {
      const pts = Math.round(((km < 1500 ? 7500 : km < 5000 ? 25000 : 45000) * x * (0.8 + r() * 0.8)) / 500) * 500;
      award.push({
        type: 'award', origin: req.origin, destination: req.destination, date: req.date, cabin: req.cabin,
        points: pts, price: null, program: p.slug, source: 'seats_aero', taxes: Math.round(5.6 + r() * 150),
        taxes_currency: 'USD', seats_remaining: 1 + Math.floor(r() * 7), airlines: CARRIERS[Math.floor(r() * CARRIERS.length)][0],
        nonstop: r() < 0.5, stops: null, duration: null, deep_link: null,
      });
    }
    cash.sort((a, b) => a.price - b.price);
    award.sort((a, b) => a.points - b.points);
    return json({ origin: req.origin, destination: req.destination, date: req.date, return_date: req.return_date,
      cabin: req.cabin, award, cash, total: award.length + cash.length });
  }

  let nextId = 100;
  async function handle(url, init) {
    const state = await ready;
    const u = new URL(url, location.origin);
    const method = (init && init.method) || 'GET';
    const body = init && init.body ? JSON.parse(init.body) : null;
    const path = u.pathname;
    await wait(path === '/api/search' ? 700 : 120); // it's a network call, after all

    if (path === '/api/airports') return json(searchAirports(state.airports, u.searchParams.get('q') || ''));
    if (path === '/api/programs') return json(state.programs);
    if (path === '/api/search' && method === 'POST') return search(state, body);
    if (path === '/api/watches' && method === 'GET') return json(state.watches);
    if (path === '/api/watches' && method === 'POST') {
      if (!body.origin || !body.destination) return json({ error: 'Invalid airport code' }, 400);
      if (body.origin === body.destination) return json({ error: 'Origin and destination must differ' }, 400);
      const w = {
        id: nextId++, label: body.label, origin: body.origin, destination: body.destination,
        date_from: body.date_from, date_to: body.date_to || body.date_from, return_offset_days: body.return_offset_days,
        cabin: body.cabin, programs: body.programs || [], include_cash: body.include_cash,
        target_points: body.target_points, target_cash_usd: body.target_cash_usd,
        poll_interval_minutes: body.poll_interval_minutes || 60, is_active: true, last_checked_at: null,
        last_drop_alert_at: null, created_at: new Date().toISOString(),
      };
      state.watches.unshift(w);
      state.history.set(w.id, []);
      return json(w, 201);
    }
    let m = path.match(/^\/api\/watches\/(\d+)(\/poll|\/history)?$/);
    if (m) {
      const id = Number(m[1]);
      const w = state.watches.find((x) => x.id === id);
      if (!w) return json({ error: 'Watch not found' }, 404);
      if (!m[2] && method === 'DELETE') {
        state.watches = state.watches.filter((x) => x.id !== id);
        return json({ deleted: id });
      }
      if (m[2] === '/history') return json({ watch_id: id, observations: state.history.get(id) || [] });
      if (m[2] === '/poll') {
        const next = state.nextPoll.get(id);
        state.nextPoll.delete(id);
        w.last_checked_at = new Date().toISOString();
        if (!next) return json({ watch_id: id, alerts: [] });
        state.history.get(id).push(...next.observations);
        return json({ watch_id: id, alerts: next.alerts });
      }
    }
    return json({ error: 'Not found in demo' }, 404);
  }

  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/api/')) return handle(url, init);
    return realFetch(input, init);
  };
})();
