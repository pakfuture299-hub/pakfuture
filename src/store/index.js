/**
 * In-memory stores for duplicate detection, per-chat rate limiting and
 * conversation sessions.
 *
 * Design notes (1,000+ chats/day):
 *  - Sessions are keyed by Telegram chat id and expire after `sessionTtlMs`
 *    so memory stays bounded even with many daily users.
 *  - Duplicate fingerprints expire after `duplicateCooldownMs` — long enough
 *    to block double submissions, short enough to allow a genuine re-apply
 *    the next day.
 *  - Rate limiting is a simple fixed-window counter per chat id.
 *
 * For multi-instance / multi-VPS deployments swap these in-memory maps for
 * Redis with the same API (see README "Scaling horizontally").
 */

const config = require('../config');

class MemoryStore {
  constructor() {
    this.sessions = new Map();
    this.duplicates = new Map();
    this.rate = new Map();
  }

  /** Session helpers -------------------------------------------------- */

  getSession(chatId) {
    const s = this.sessions.get(chatId);
    if (!s) return null;
    if (Date.now() - s.updatedAt > config.limits.sessionTtlMs) {
      this.sessions.delete(chatId);
      return null;
    }
    return s;
  }

  saveSession(chatId, session) {
    session.updatedAt = Date.now();
    this.sessions.set(chatId, session);
    // Opportunistic cleanup: keep the map bounded under heavy traffic.
    if (this.sessions.size > 50_000) this._sweepExpiredSessions();
  }

  clearSession(chatId) {
    this.sessions.delete(chatId);
  }

  /** Duplicate helpers -------------------------------------------------- */

  isDuplicate(fingerprint) {
    if (!fingerprint) return false;
    const seenAt = this.duplicates.get(fingerprint);
    if (!seenAt) return false;
    return Date.now() - seenAt < config.limits.duplicateCooldownMs;
  }

  markDuplicate(fingerprint) {
    if (!fingerprint) return;
    this.duplicates.set(fingerprint, Date.now());
  }

  /** Rate limiting ------------------------------------------------------ */

  /** Returns true when the chat may proceed, false when throttled. */
  allowMessage(chatId, limit = config.limits.ratePerMinute) {
    const now = Date.now();
    const bucket = this.rate.get(chatId);
    if (!bucket || now - bucket.startedAt >= 60_000) {
      this.rate.set(chatId, { startedAt: now, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  /** Housekeeping ------------------------------------------------------- */

  _sweepExpiredSessions() {
    const now = Date.now();
    for (const [chatId, s] of this.sessions) {
      if (now - s.updatedAt > config.limits.sessionTtlMs) {
        this.sessions.delete(chatId);
      }
    }
  }
}

module.exports = new MemoryStore();
