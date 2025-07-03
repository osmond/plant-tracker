import { parseLocalDate, addDays, formatDateShort } from '../js/dates.js';

test('parseLocalDate parses yyyy-mm-dd', () => {
  const d = parseLocalDate('2023-01-02');
  expect(d.getFullYear()).toBe(2023);
  expect(d.getMonth()).toBe(0);
  expect(d.getDate()).toBe(2);
});

test('addDays adds days correctly', () => {
  const d = addDays('2023-01-01', 5);
  expect(d.toISOString().split('T')[0]).toBe('2023-01-06');
});

test('formatDateShort returns labeled dates', () => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const todayLabel = today.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' \u2013 today';
  expect(formatDateShort(todayStr)).toBe(todayLabel);

  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const yestStr = yest.toISOString().split('T')[0];
  const yestLabel = yest.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' \u2013 yesterday';
  expect(formatDateShort(yestStr)).toBe(yestLabel);
});
