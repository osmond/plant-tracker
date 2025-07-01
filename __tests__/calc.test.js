import { calculateET0, computeArea } from '../js/calc.js';

test('computeArea calculates circle area', () => {
  expect(computeArea(10)).toBeCloseTo(Math.PI * 25);
});

test('calculateET0 computes evapotranspiration', () => {
  const val = calculateET0(10, 20);
  expect(val).toBeCloseTo(4.7712, 4);
});
