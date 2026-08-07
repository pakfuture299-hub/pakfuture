/**
 * Pure validation helpers for candidate data.
 *
 * All functions are synchronous, side-effect free and unit-tested in
 * tests/validation.test.js.
 */

const PHONE_RE = /^\+?[0-9]{7,15}$/;
const TELEGRAM_USERNAME_RE = /^@[a-zA-Z0-9_]{4,32}$/;
// A number that may also be a Telegram-registered number (digits only).
const TELEGRAM_NUMBER_RE = /^\+?[0-9]{7,15}$/;

/** Normalise user text: trim, collapse whitespace, strip common filler. */
function normalizeText(input) {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/\s+/g, ' ').replace(/[\u2018\u2019]/g, "'");
}

/**
 * Validate a full name.
 * Accepts letters, spaces, dots, apostrophes and hyphens; 2–80 chars.
 */
function isValidName(name) {
  const s = normalizeText(name);
  if (s.length < 2 || s.length > 80) return false;
  return /^[A-Za-z\u0600-\u06FF .'-]+$/.test(s);
}

/**
 * Validate a phone number.
 * Digits only, optionally with a leading +, 7–15 digits (ITU-T E.164 range).
 * Spaces/dashes are tolerated because they are stripped before matching.
 */
function isValidPhone(phone) {
  const s = normalizeText(phone);
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  return /^\+?[0-9]+$/.test(s.replace(/[\s-]/g, ''));
}

/**
 * Validate a Telegram identifier: @username or a phone number.
 */
function isValidTelegram(value) {
  const s = normalizeText(value);
  if (s.startsWith('@')) {
    return TELEGRAM_USERNAME_RE.test(s);
  }
  return TELEGRAM_NUMBER_RE.test(s) && s.replace(/\D/g, '').length >= 7;
}

/** Normalise a phone to a canonical storage form: digits, + prefix kept. */
function normalizePhone(phone) {
  const s = normalizeText(phone);
  if (!s) return '';
  return s.startsWith('+') ? '+' + s.replace(/\D/g, '') : s.replace(/\D/g, '');
}

/** Normalise a Telegram identifier to @username (lowercased) or digits. */
function normalizeTelegram(value) {
  const s = normalizeText(value);
  if (!s) return '';
  if (s.startsWith('@')) return s.toLowerCase();
  return s.startsWith('+') ? '+' + s.replace(/\D/g, '') : s.replace(/\D/g, '');
}

/** Strip anything that is not a digit from a string. */
function digitsOnly(value) {
  return normalizeText(value).replace(/\D/g, '');
}

/** Lightweight fingerprint used for duplicate detection (phone first). */
function candidateFingerprint(phone, telegram) {
  const p = digitsOnly(phone);
  const t = normalizeTelegram(telegram);
  if (p) return `phone:${p}`;
  if (t) return `tg:${t}`;
  return null;
}

/**
 * Out-of-scope guardrail check. Any user text that clearly asks about
 * topics outside the store's knowledge is redirected. This is a simple,
 * dependency-free pre-filter; the model handles the deeper semantic decision.
 */
const REDIRECT_KEYWORDS = [
  'refund',
  'return policy',
  'shipping',
  'track my order',
  'track order',
  'where is my parcel',
  'where is my order',
  'delivery time',
  'delivery',
  'discount code',
  'coupon code',
  'promo code',
  'product warranty',
  'cancel my order',
  'account password',
  'reset password',
  'product price',
  'how much is this product',
  'buy product',
  'checkout',
];

function isRedirectTrigger(text) {
  const s = normalizeText(text).toLowerCase();
  return REDIRECT_KEYWORDS.some((k) => s.includes(k));
}

module.exports = {
  normalizeText,
  isValidName,
  isValidPhone,
  isValidTelegram,
  normalizePhone,
  normalizeTelegram,
  digitsOnly,
  candidateFingerprint,
  isRedirectTrigger,
};
