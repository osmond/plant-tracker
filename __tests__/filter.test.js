import { jest } from '@jest/globals';

function setupDOM() {
  document.body.innerHTML = `
    <div id="plant-grid"></div>
    <select id="room-filter"><option value="all">All</option><option value="Kitchen">Kitchen</option><option value="Patio">Patio</option></select>
    <select id="status-filter"><option value="all" selected>All</option><option value="water">Watering</option><option value="any">Needs Care</option></select>
    <input id="search-input" value="" />
    <header id="summary">
      <button id="show-add-form"></button>
      <div id="summary-counts"></div>
      <div id="summary-date"></div>
      <div id="summary-weather"></div>
    </header>
    <div id="room-summary"></div>
    <select id="sort-toggle"></select>

    <div id="filter-chips"></div>

    <button id="clear-filters"></button>

    <span id="seg-all-count"></span>
    <span id="seg-water-count"></span>
    <span id="seg-fert-count"></span>

    <form id="plant-form"></form>
    <button id="undo-btn"></button>
    <button id="cancel-edit"></button>

    <div id="type-filters"><label><input type="checkbox" value="succulent" /></label></div>

    <div id="location-filters"><label><input type="checkbox" value="outside" /></label><label><input type="checkbox" value="inside" checked /></label></div>
    <div id="type-filters"><label><input type="checkbox" value="succulent" />Succulent</label><label><input type="checkbox" value="herb" />Herb</label></div>

    <footer><button id="export-all"></button></footer>

  `;
}

beforeEach(() => {
  jest.resetModules();
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
});

test('loadPlants filters by room and search query', async () => {
  setupDOM();
  const plants = [
    { id: 1, name: 'Aloe', species: 'Aloe vera', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' },
    { id: 2, name: 'Basil', species: 'Ocimum', room: 'Patio', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  document.getElementById('search-input').value = 'aloe';
  document.getElementById('room-filter').value = 'Kitchen';
  await mod.loadPlants();

  const cards = document.querySelectorAll('.plant-card-wrapper');
  expect(cards.length).toBe(1);
  expect(cards[0].id).toBe('plant-1');
});

test('loadPlants respects status filter', async () => {
  setupDOM();
  jest.useFakeTimers().setSystemTime(new Date('2023-01-10'));
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' },
    { id: 2, name: 'B', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-08', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  document.getElementById('status-filter').value = 'water';
  await mod.loadPlants();

  jest.useRealTimers();

  const cards = document.querySelectorAll('.plant-card-wrapper');
  expect(cards.length).toBe(1);
  expect(cards[0].id).toBe('plant-1');
});

test('loadPlants filters by plant type checkbox', async () => {
  setupDOM();
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Garden', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01', plant_type: 'succulent' },
    { id: 2, name: 'B', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01', plant_type: 'herb' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  const typeCheck = document.querySelector('#type-filters input[value="succulent"]');
  typeCheck.checked = true;
  await mod.loadPlants();

  const cards = document.querySelectorAll('.plant-card-wrapper');
  expect(cards.length).toBe(1);
  expect(cards[0].id).toBe('plant-1');
});

test('loadPlants filters by plant type', async () => {
  setupDOM();
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', plant_type: 'succulent', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' },
    { id: 2, name: 'B', species: 'sp', room: 'Kitchen', plant_type: 'herb', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  const succulentCheck = document.querySelector('#type-filters input[value="succulent"]');
  succulentCheck.checked = true;
  const herbCheck = document.querySelector('#type-filters input[value="herb"]');
  herbCheck.checked = false;
  await mod.loadPlants();

  const cards = document.querySelectorAll('.plant-card-wrapper');
  expect(cards.length).toBe(1);
  expect(cards[0].id).toBe('plant-1');
});

test('status chip label toggles with filter', async () => {
  setupDOM();
  document.getElementById('filter-chips').innerHTML = `<button class="chip active"><span id="status-chip-label">Show All</span><span id="needs-care-alert" class="needs-care-alert hidden"></span></button>`;
  jest.useFakeTimers().setSystemTime(new Date('2023-01-10'));
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  const statusChip = document.querySelector('#filter-chips button.chip');
  const statusLabel = document.getElementById('status-chip-label');
  const statusFilter = document.getElementById('status-filter');

  statusFilter.value = 'any';
  statusChip.classList.add('active');
  await mod.loadPlants();
  expect(statusLabel.textContent).toBe('Show All');

  statusFilter.value = 'all';
  statusChip.classList.remove('active');
  await mod.loadPlants();
  expect(statusLabel.textContent).toBe('Needs Care');
  jest.useRealTimers();
});

test('needs care alert badge shows count', async () => {
  setupDOM();
  document.getElementById('filter-chips').innerHTML = `<button class="chip"><span id="status-chip-label">Needs Care</span><span id="needs-care-alert" class="needs-care-alert hidden"></span></button>`;
  jest.useFakeTimers().setSystemTime(new Date('2023-01-10'));
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  await mod.loadPlants();
  const badge = document.getElementById('needs-care-alert');
  expect(badge.textContent).toBe('1');
  expect(badge.classList.contains('hidden')).toBe(false);
  jest.useRealTimers();
});

test('needs care alert count ignores room filter', async () => {
  setupDOM();
  document.getElementById('filter-chips').innerHTML = `<button class="chip"><span id="status-chip-label">Needs Care</span><span id="needs-care-alert" class="needs-care-alert hidden"></span></button>`;
  jest.useFakeTimers().setSystemTime(new Date('2023-01-10'));
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' },
    { id: 2, name: 'B', species: 'sp', room: 'Patio', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-05', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  document.getElementById('room-filter').value = 'Patio';
  await mod.loadPlants();
  const badge = document.getElementById('needs-care-alert');
  expect(badge.textContent).toBe('1');
  expect(badge.classList.contains('hidden')).toBe(false);
  jest.useRealTimers();
});

test('summary item click updates status filter', async () => {
  setupDOM();
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  await mod.loadPlants();
  const waterItem = document.querySelector('#summary .summary-item[data-status="water"]');
  waterItem.click();
  expect(document.getElementById('status-filter').value).toBe('water');
  expect(waterItem.getAttribute('aria-pressed')).toBe('true');
  const other = document.querySelector('#summary .summary-item[data-status="all"]');
  expect(other.getAttribute('aria-pressed')).toBe('false');
});

test('segment totals persist across filtering', async () => {
  setupDOM();
  jest.useFakeTimers().setSystemTime(new Date('2023-01-10'));
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' },
    { id: 2, name: 'B', species: 'sp', room: 'Patio', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-09', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  await mod.loadPlants();
  expect(document.getElementById('seg-all-count').textContent).toBe('2');

  document.getElementById('status-filter').value = 'water';
  await mod.loadPlants();
  expect(document.getElementById('seg-all-count').textContent).toBe('2');
  jest.useRealTimers();
});

test('clear filters button resets values and recounts', async () => {
  setupDOM();
  jest.useFakeTimers().setSystemTime(new Date('2023-01-10'));
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' },
    { id: 2, name: 'B', species: 'sp', room: 'Patio', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-09', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });
  document.dispatchEvent(new Event('DOMContentLoaded'));

  document.getElementById('room-filter').value = 'Kitchen';
  await mod.loadPlants();
  expect(document.querySelectorAll('.plant-card-wrapper').length).toBe(1);

  document.getElementById('clear-filters').click();

  expect(document.getElementById('room-filter').value).toBe('all');
  expect(document.getElementById('status-filter').value).toBe('all');

  await mod.loadPlants();
  expect(document.querySelectorAll('.plant-card-wrapper').length).toBe(2);
  expect(document.getElementById('seg-all-count').textContent).toBe('2');
  jest.useRealTimers();
});

test('room summary shows due count', async () => {
  setupDOM();
  jest.useFakeTimers().setSystemTime(new Date('2023-01-10'));
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' },
    { id: 2, name: 'B', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' },
    { id: 3, name: 'C', species: 'sp', room: 'Patio', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-09', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(plants)
  });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });
  document.getElementById('room-filter').value = 'Kitchen';
  await mod.loadPlants();
  const roomItem = document.querySelector('#room-summary .summary-room');
  expect(roomItem.textContent).toBe('2 in Kitchen \u2014 2 need care');
  jest.useRealTimers();
});

