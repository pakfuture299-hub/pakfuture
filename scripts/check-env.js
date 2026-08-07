/**
 * Boot-time environment check.
 *
 * Prints every configured variable (with secrets masked) and exits with a
 * non-zero code when a required variable is missing. Run it in CI or as part
 * of the VPS deployment:
 *
 *   node scripts/check-env.js
 */

const config = require('../src/config');

const mask = (v) => (v ? v.slice(0, 4) + '…' + v.slice(-4) : '');

const rows = [
  ['NODE_ENV', config.env, false],
  ['PORT', config.port, false],
  ['OPENAI_API_KEY', mask(config.openai.apiKey), true],
  ['OPENAI_MODEL', config.openai.model, false],
  ['INVITE_LINK', config.inviteLink, true],
];

console.log('Environment check:');
for (const [key, value, required] of rows) {
  if (required && (value === undefined || value === '' || /^your-/.test(value))) {
    console.log(`  ✗ ${key}: MISSING`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${key}: ${value}`);
  }
}

if (process.exitCode) {
  console.log('\nFix the missing variables above in your .env file, then re-run.');
} else {
  console.log('\nAll required variables present.');
}
