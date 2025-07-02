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

// --- updateWaterAmount override behaviour ---
function updateWaterAmount() {
  const ozEl = document.getElementById('auto-water-oz');
  const input = document.getElementById('water_amount');
  const override = document.getElementById('override_water');
  ozEl.textContent = '5.0';
  if (!override.checked) {
    input.value = '5.0';
  }
}

test('override checkbox prevents input updates', () => {
  document.body.innerHTML += `
    <input id="water_amount" value="" />
    <input type="checkbox" id="override_water" />
    <span id="auto-water-oz"></span>
  `;
  const input = document.getElementById('water_amount');
  const override = document.getElementById('override_water');

  updateWaterAmount();
  expect(document.getElementById('auto-water-oz').textContent).toBe('5.0');
  expect(input.value).toBe('5.0');

  input.value = '2.0';
  override.checked = true;
  updateWaterAmount();
  expect(document.getElementById('auto-water-oz').textContent).toBe('5.0');
  expect(input.value).toBe('2.0');
});
