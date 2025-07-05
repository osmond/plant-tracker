import { jest } from '@jest/globals';

// Prevent init() from running by faking loading state
beforeEach(() => {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => 'loading',
  });
});

test('focusPlantId set from hash', async () => {
  window.location.hash = '#plant-5';
  let mod;
  await jest.isolateModulesAsync(async () => {
    mod = await import('../script.js');
  });
  expect(mod.focusPlantId).toBe('5');
});

test('clear hash resets focusPlantId and prevents URL updates', async () => {
  window.location.hash = '#plant-5';
  document.body.innerHTML = `
    <div id="plant-grid"></div>
    <select id="room-filter"><option value="all">All</option></select>
    <input id="search-input" value="" />
    <header id="summary">
      <div id="summary-counts"></div>
      <div id="summary-date"></div>
      <div id="summary-weather"></div>
    </header>
    <select id="sort-toggle"></select>
  `;

  HTMLElement.prototype.scrollIntoView = jest.fn();

  global.fetch = jest.fn().mockResolvedValue({
    json: () =>
      Promise.resolve([
        {
          id: 5,
          name: 'Test',
          species: 'Spec',
          room: 'Room1',
          watering_frequency: 7,
          fertilizing_frequency: 7,
          last_watered: '2023-01-01',
          last_fertilized: '2023-01-01',
          created_at: '2023-01-01',
        },
      ]),
  });

  let mod;
  await jest.isolateModulesAsync(async () => {
    mod = await import('../script.js');
  });

  await mod.loadPlants();
  expect(window.location.hash).toBe('#plant-5');

  document.dispatchEvent(new Event('click'));
  expect(mod.focusPlantId).toBeNull();
  expect(window.location.hash).toBe('');

  await mod.loadPlants();
  expect(window.location.hash).toBe('');
});
