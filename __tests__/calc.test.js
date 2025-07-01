import { calculateET0, computeArea, computeRA } from '../js/calc.js';

test('computeArea calculates circle area', () => {
  expect(computeArea(10)).toBeCloseTo(Math.PI * 25);
});

test('calculateET0 computes evapotranspiration', () => {
  const val = calculateET0(10, 20);
  expect(val).toBeCloseTo(4.7712, 4);
});

test('computeRA calculates extraterrestrial radiation', () => {
  const val = computeRA(45, 172);
  expect(val).toBeCloseTo(41.91, 2);
});
