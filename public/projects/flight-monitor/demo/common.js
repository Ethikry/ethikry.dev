'use strict';

// Shared helpers used by both the search page (app.js) and watches page
// (watches.js). Loaded before either.

const $ = id => document.getElementById(id);

function esc(str) {
  // Minimal HTML-escape for text injected via innerHTML
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Airport typeahead. `hiddenId` receives the resolved IATA code; it is cleared
// while the user edits so a stale code can never be submitted.
function setupAutocomplete(inputId, dropdownId, hiddenId) {
  const input    = $(inputId);
  const dropdown = $(dropdownId);
  const hidden   = $(hiddenId);
  let debounce   = null;
  let _lastQuery = '';

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q === _lastQuery) return;
    _lastQuery = q;
    hidden.value = '';
    clearTimeout(debounce);
    if (q.length < 1) { closeDropdown(); return; }
    debounce = setTimeout(() => fetchAirports(q), 200);
  });

  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q.length >= 1) fetchAirports(q);
  });

  input.addEventListener('keydown', e => {
    const items    = [...dropdown.querySelectorAll('.dropdown-item')];
    const activeEl = dropdown.querySelector('.dropdown-item.highlighted');
    if (!dropdown.classList.contains('open')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = activeEl ? items[items.indexOf(activeEl) + 1] || items[0] : items[0];
      highlight(next, items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = activeEl ? items[items.indexOf(activeEl) - 1] || items[items.length - 1] : items[items.length - 1];
      highlight(prev, items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hi = dropdown.querySelector('.dropdown-item.highlighted');
      if (hi) hi.click();
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
  });

  function highlight(el, items) {
    items.forEach(i => i.classList.remove('highlighted'));
    if (el) el.classList.add('highlighted');
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
  }

  async function fetchAirports(q) {
    try {
      const res  = await fetch(`/api/airports?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      renderDropdown(data);
    } catch { /* network errors silently ignored */ }
  }

  function renderDropdown(airports) {
    dropdown.innerHTML = '';
    if (!airports.length) { dropdown.classList.remove('open'); return; }

    airports.forEach(a => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.setAttribute('role', 'option');
      item.innerHTML =
        `<span class="iata-badge">${esc(a.iata)}</span>` +
        `<span class="airport-info">` +
          `<div class="airport-city">${esc(a.city)}</div>` +
          `<div class="airport-name">${esc(a.name)}</div>` +
        `</span>` +
        `<span class="airport-country">${esc(a.country)}</span>`;

      item.addEventListener('click', () => {
        input.value  = `${a.city} (${a.iata})`;
        hidden.value = a.iata;
        _lastQuery   = input.value;
        closeDropdown();
        input.blur();
      });

      dropdown.appendChild(item);
    });

    dropdown.classList.add('open');
  }
}
