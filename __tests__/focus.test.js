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
