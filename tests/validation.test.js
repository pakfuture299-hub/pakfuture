/**
 * Unit tests for the validation helpers.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidName,
  isValidPhone,
  isValidTelegram,
  normalizePhone,
  normalizeTelegram,
  candidateFingerprint,
  isRedirectTrigger,
} = require('../src/utils/validation');

test('isValidName accepts normal names', () => {
  assert.ok(isValidName('Ali Raza'));
  assert.ok(isValidName('Ayesha Khan'));
  assert.ok(isValidName("Muhammad O'Neil"));
  assert.ok(isValidName('Zara-Ali'));
  assert.ok(isValidName('محمد علی')); // Urdu letters allowed
});

test('isValidName rejects empty, numbers, symbols, too short', () => {
  assert.equal(isValidName(''), false);
  assert.equal(isValidName(' '), false);
  assert.equal(isValidName('A'), false);
  assert.equal(isValidName('Ali123'), false);
  assert.equal(isValidName('Ali!!'), false);
  assert.equal(isValidName('a'.repeat(81)), false);
});

test('isValidPhone accepts international and local formats', () => {
  assert.ok(isValidPhone('03001234567'));
  assert.ok(isValidPhone('+923001234567'));
  assert.ok(isValidPhone('923001234567'));
  assert.ok(isValidPhone('+1 555 123 4567')); // spaces collapsed by normalize
});

test('isValidPhone rejects letters and too-short numbers', () => {
  assert.equal(isValidPhone('12345'), false); // too short
  assert.equal(isValidPhone('abc1234567'), false);
  assert.equal(isValidPhone(''), false);
});

test('isValidTelegram accepts @username and phone', () => {
  assert.ok(isValidTelegram('@ali_raza'));
  assert.ok(isValidTelegram('@AliRaza123'));
  assert.ok(isValidTelegram('03001234567'));
  assert.ok(isValidTelegram('+923001234567'));
});

test('isValidTelegram rejects invalid usernames', () => {
  assert.equal(isValidTelegram('@a'), false); // too short
  assert.equal(isValidTelegram('@ali raza'), false); // space
  assert.equal(isValidTelegram('ali'), false); // no @ prefix
  assert.equal(isValidTelegram('123'), false); // too short number
});

test('normalizePhone keeps digits and + prefix', () => {
  assert.equal(normalizePhone('0300 123 4567'), '03001234567');
  assert.equal(normalizePhone('+92 300 1234567'), '+923001234567');
});

test('normalizeTelegram lowercases usernames, keeps phone digits', () => {
  assert.equal(normalizeTelegram('@AliRaza'), '@aliraza');
  assert.equal(normalizeTelegram('+92 300 1234567'), '+923001234567');
});

test('candidateFingerprint prefers phone, falls back to telegram', () => {
  assert.equal(candidateFingerprint('03001234567', '@ali'), 'phone:03001234567');
  assert.equal(candidateFingerprint('', '@ali'), 'tg:@ali');
  assert.equal(candidateFingerprint('', ''), null);
});

test('isRedirectTrigger catches out-of-scope keywords', () => {
  assert.ok(isRedirectTrigger('I want a refund'));
  assert.ok(isRedirectTrigger('Where is my order?'));
  assert.ok(isRedirectTrigger('Do you have a discount code?'));
  assert.equal(isRedirectTrigger('What jobs do you have?'), false);
  assert.equal(isRedirectTrigger('Hi, how are you?'), false);
});
