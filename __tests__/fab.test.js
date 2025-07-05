import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => 'loading'
  });
});

test('clicking show-add-form reveals form', async () => {
  document.body.innerHTML = `
    <button id="show-add-form"></button>
    <form id="plant-form" style="display:none;"></form>
    <button id="undo-btn"></button>
    <button id="cancel-edit"></button>
    <div id="plant-grid"></div>
    <select id="room-filter"><option value="all">All</option></select>
    <input id="search-input" value="" />
    <select id="sort-toggle"><option value="due">Due</option></select>
  `;

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([])
  });

  await jest.isolateModulesAsync(async () => { await import('../script.js'); });

  document.dispatchEvent(new Event('DOMContentLoaded'));

  const btn = document.getElementById('show-add-form');
  const form = document.getElementById('plant-form');

  expect(form.style.display).toBe('none');
  btn.click();
  expect(form.style.display).toBe('block');
});
