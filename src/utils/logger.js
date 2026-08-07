/**
 * Minimal structured logger.
 *
 * Levels: debug < info < warn < error. `DEBUG` env var or NODE_ENV=development
 * enables debug output. JSON lines when NODE_ENV=production (easy to ship to
 * any log aggregator), pretty text otherwise.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const level =
  process.env.DEBUG || process.env.NODE_ENV === 'development'
    ? 'debug'
    : 'info';

const threshold = LEVELS[level] ?? LEVELS.info;

function write(levelName, msg, meta) {
  if (LEVELS[levelName] < threshold) return;
  const entry = {
    ts: new Date().toISOString(),
    level: levelName,
    msg,
    ...(meta ? { ...meta } : {}),
  };
  const line =
    process.env.NODE_ENV === 'production'
      ? JSON.stringify(entry)
      : `${entry.ts} [${levelName.toUpperCase()}] ${msg}${
          meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
        }`;
  const stream = levelName === 'error' ? process.stderr : process.stdout;
  stream.write(line + '\n');
}

module.exports = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
