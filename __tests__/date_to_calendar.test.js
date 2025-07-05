import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => 'loading'
  });
});

test('summary date scrolls to calendar', async () => {
  document.body.innerHTML = `
    <div id="toast"></div>
    <div id="plant-grid"></div>
    <select id="room-filter" multiple></select>
    <input id="search-input" value="" />
    <header id="summary">
      <button id="show-add-form"></button>
      <div id="summary-counts"></div>
      <div id="summary-date"></div>
      <div id="summary-weather"></div>
    </header>
    <select id="sort-toggle"></select>
    <form id="plant-form"></form>
    <button id="undo-btn"></button>
    <button id="cancel-edit"></button>
    <div id="calendar-heading"></div>
  `;

  HTMLElement.prototype.scrollIntoView = jest.fn();

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([])
  });

  await jest.isolateModulesAsync(async () => { await import('../script.js'); });
  document.dispatchEvent(new Event('DOMContentLoaded'));

  const dateEl = document.getElementById('summary-date');
  dateEl.click();

  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
});
