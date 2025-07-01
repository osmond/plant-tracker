import { showToast, toggleLoading } from '../js/dom.js';

beforeEach(() => {
  document.body.innerHTML = `
    <div id="toast"></div>
    <div id="loading-overlay" class="hidden"></div>
  `;
});

test('showToast displays and toggles class', () => {
  showToast('hi');
  const toast = document.getElementById('toast');
  expect(toast.textContent).toBe('hi');
  expect(toast.classList.contains('show')).toBe(true);
});

test('toggleLoading toggles visibility', () => {
  const overlay = document.getElementById('loading-overlay');
  toggleLoading(true);
  expect(overlay.classList.contains('hidden')).toBe(false);
  toggleLoading(false);
  expect(overlay.classList.contains('hidden')).toBe(true);
});
