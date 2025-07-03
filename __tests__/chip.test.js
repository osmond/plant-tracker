import { jest } from '@jest/globals';

function setupDOM() {
  document.body.innerHTML = `
    <button id="filter-toggle"></button>
    <div id="filter-chips"></div>
    <span id="filter-summary"></span>
    <select id="room-filter"><option value="all">All Rooms</option><option value="Kitchen">Kitchen</option></select>
    <select id="status-filter"><option value="any">Needs Care</option></select>
    <select id="sort-toggle"><option value="due">Due Date</option><option value="name">Name</option></select>
    <div id="type-filters"><label>Succulent<input type="checkbox" value="succulent"></label></div>
  `;
}

beforeEach(() => {
  jest.resetModules();
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
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
