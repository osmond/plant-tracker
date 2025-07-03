import { jest } from '@jest/globals';

function setupDOM() {
  document.body.innerHTML = `
    <button id="filter-toggle"></button>
    <div id="filter-chips"></div>
    <span id="filter-summary"></span>
    <select id="room-filter"><option value="all">All Rooms</option><option value="Kitchen">Kitchen</option></select>
    <select id="status-filter"><option value="all" selected>All</option><option value="any">Needs Care</option></select>
    <select id="sort-toggle"><option value="due">Due Date</option><option value="name">Name</option></select>
    <div id="type-filters"><label>Succulent<input type="checkbox" value="succulent"></label></div>
    <button id="undo-btn"></button>
    <button id="cancel-edit"></button>
    <form id="plant-form"></form>
    <div id="filter-panel"></div>
  `;
}

beforeEach(() => {
  jest.resetModules();
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
  localStorage.clear();
});

test('updateFilterChips shows count and chips', async () => {
  setupDOM();
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });
  mod.updateFilterChips();
  expect(document.querySelectorAll('#filter-chips .filter-chip').length).toBe(0);
  expect(document.getElementById('filter-summary').textContent).toBe('No filters');
  expect(document.getElementById('filter-toggle').getAttribute('data-count')).toBe('0');

  document.getElementById('room-filter').value = 'Kitchen';
  document.querySelector('#type-filters input').checked = true;
  mod.updateFilterChips();
  const chips = document.querySelectorAll('#filter-chips .filter-chip');
  expect(chips.length).toBe(2);
  expect(chips[0].textContent).toContain('Kitchen');
  expect(document.getElementById('filter-toggle').getAttribute('data-count')).toBe('2');
});

test('invalid saved values are ignored', async () => {
  setupDOM();
  localStorage.setItem('roomFilter', 'Garage');
  localStorage.setItem('sortPref', 'bogus');
  localStorage.setItem('statusFilter', 'bad');
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });
  mod.loadFilterPrefs();

  const roomEl = document.getElementById('room-filter');
  const sortEl = document.getElementById('sort-toggle');
  const statusEl = document.getElementById('status-filter');
  expect(roomEl.value).toBe('all');
  expect(sortEl.value).toBe('due');
  expect(statusEl.value).toBe('all');

  roomEl.value = 'Unknown';
  sortEl.value = 'Foo';
  statusEl.value = 'Bar';

  expect(() => mod.updateFilterChips()).not.toThrow();
  expect(document.querySelectorAll('#filter-chips .filter-chip').length).toBe(0);
});
