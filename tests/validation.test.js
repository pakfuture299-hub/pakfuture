/**
 * Unit tests for the validation helpers.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidName,
  isValidPhone,
  isValidDiscordUsername,
  normalizePhone,
  normalizeDiscordUsername,
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

test('isValidDiscordUsername accepts normal Discord usernames', () => {
  assert.ok(isValidDiscordUsername('ali_raza'));
  assert.ok(isValidDiscordUsername('AliRaza123'));
  assert.ok(isValidDiscordUsername('ali.raza_2'));
  assert.ok(isValidDiscordUsername('@ali_raza')); // leading @ tolerated
  assert.ok(isValidDiscordUsername('bukhtiyaarhussainbranch2050'));
});

test('isValidDiscordUsername rejects invalid usernames', () => {
  assert.equal(isValidDiscordUsername('a'), false); // too short
  assert.equal(isValidDiscordUsername('ali raza'), false); // space
  assert.equal(isValidDiscordUsername('ali!'), false); // symbol
  assert.equal(isValidDiscordUsername('.ali'), false); // leading dot
  assert.equal(isValidDiscordUsername('ali.'), false); // trailing dot
  assert.equal(isValidDiscordUsername('al..i'), false); // consecutive dots
  assert.equal(isValidDiscordUsername(''), false);
});

test('normalizePhone keeps digits and + prefix', () => {
  assert.equal(normalizePhone('0300 123 4567'), '03001234567');
  assert.equal(normalizePhone('+92 300 1234567'), '+923001234567');
});

test('normalizeDiscordUsername strips @ and trims', () => {
  assert.equal(normalizeDiscordUsername('@AliRaza'), 'AliRaza');
  assert.equal(normalizeDiscordUsername('ali_raza'), 'ali_raza');
  assert.equal(normalizeDiscordUsername(''), '');
});

test('candidateFingerprint prefers phone, falls back to discord username', () => {
  assert.equal(candidateFingerprint('03001234567', 'ali_raza'), 'phone:03001234567');
  assert.equal(candidateFingerprint('', 'Ali_Raza'), 'dc:ali_raza');
  assert.equal(candidateFingerprint('', ''), null);
});

test('isRedirectTrigger catches out-of-scope keywords', () => {
  assert.ok(isRedirectTrigger('I want a refund'));
  assert.ok(isRedirectTrigger('Where is my order?'));
  assert.ok(isRedirectTrigger('Do you have a discount code?'));
  assert.equal(isRedirectTrigger('What jobs do you have?'), false);
  assert.equal(isRedirectTrigger('Hi, how are you?'), false);
});
