import { jest } from '@jest/globals';

function setupDOM() {
  document.body.innerHTML = `
    <div id="toast"></div>
    <div id="plant-grid"></div>
    <select id="room-filter"><option value="all">All</option></select>
    <select id="status-filter"><option value="all" selected>All</option></select>
    <input id="search-input" value="" />
    <header id="summary">
      <button id="show-add-form"></button>
      <div id="summary-counts"></div>
      <div id="summary-date"></div>
      <div id="summary-weather"></div>
    </header>
    <select id="sort-toggle"></select>
    <div id="filter-chips"></div>
    <button id="clear-filters"></button>
    <form id="plant-form"></form>
    <button id="undo-btn"></button>
    <button id="cancel-edit"></button>
    <div id="type-filters"></div>
    <div id="calendar"></div>
  `;
}

beforeEach(() => {
  jest.resetModules();
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
});

test('loadPlants shows toast on fetch error', async () => {
  setupDOM();
  global.fetch = jest.fn().mockRejectedValue(new Error('fail'));
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });
  await mod.loadPlants();
  const toast = document.getElementById('toast');
  expect(toast.textContent).toBe('Failed to load plants');
  expect(toast.classList.contains('show')).toBe(true);
});

test('loadCalendar shows toast on fetch error', async () => {
  setupDOM();
  global.fetch = jest.fn().mockRejectedValue(new Error('fail'));
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });
  await mod.loadCalendar();
  const toast = document.getElementById('toast');
  expect(toast.textContent).toBe('Failed to load calendar data');
  expect(toast.classList.contains('show')).toBe(true);
});
