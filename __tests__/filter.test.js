import { jest } from '@jest/globals';

function setupDOM() {
  document.body.innerHTML = `
    <div id="plant-grid"></div>
    <select id="room-filter"><option value="all">All</option><option value="Kitchen">Kitchen</option><option value="Patio">Patio</option></select>
    <select id="status-filter"><option value="all">All</option><option value="water">Watering</option><option value="any">Needs Care</option></select>
    <input id="search-input" value="" />
    <div id="summary"></div>
    <select id="sort-toggle"></select>

    <div id="type-filters"><label><input type="checkbox" value="succulent" /></label></div>

    <div id="location-filters"><label><input type="checkbox" value="outside" /></label><label><input type="checkbox" value="inside" checked /></label></div>
    <div id="type-filters"><label><input type="checkbox" value="succulent" />Succulent</label><label><input type="checkbox" value="herb" />Herb</label></div>

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
  global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(plants) });
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
  global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(plants) });
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
  global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(plants) });
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
  global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(plants) });
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

test('status chip text toggles based on filter', async () => {
  setupDOM();
  document.body.innerHTML += `<button id="status-chip" class="btn btn-primary active"><span id="status-chip-label">Needs Care</span><span id="needs-care-alert" class="needs-care-alert hidden"></span></button>`;
  jest.useFakeTimers().setSystemTime(new Date('2023-01-10'));
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(plants) });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  const statusChip = document.getElementById('status-chip');
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
  document.body.innerHTML += `<button id="status-chip" class="btn btn-primary"><span id="status-chip-label">Needs Care</span><span id="needs-care-alert" class="needs-care-alert hidden"></span></button>`;
  jest.useFakeTimers().setSystemTime(new Date('2023-01-10'));
  const plants = [
    { id: 1, name: 'A', species: 'sp', room: 'Kitchen', watering_frequency: 7, fertilizing_frequency: 0, last_watered: '2023-01-01', last_fertilized: null, created_at: '2023-01-01' }
  ];
  global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(plants) });
  let mod;
  await jest.isolateModulesAsync(async () => { mod = await import('../script.js'); });

  await mod.loadPlants();
  const badge = document.getElementById('needs-care-alert');
  expect(badge.textContent).toBe('1');
  expect(badge.classList.contains('hidden')).toBe(false);
  jest.useRealTimers();
});
