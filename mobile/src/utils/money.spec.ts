import { parseMoneyInput } from './money';
it.each([
  '',
  '0',
  '-10',
  'NaN',
  'Infinity',
  '1e3',
  '0x100',
  '1.001',
  '1,000.00',
  '9007199254740992',
])('rejects ambiguous or unsafe financial input %s', (value) => {
  expect(parseMoneyInput(value)).toBeNull();
});
it.each([
  [' 12.25 ', 12.25],
  ['12,25', 12.25],
  ['0.01', 0.01],
  ['100', 100],
])('parses a valid positive amount %s', (value, amount) => {
  expect(parseMoneyInput(value)).toBe(amount);
});
