'use strict';

const NodeCache = require('node-cache');
const env = require('./env');

/**
 * Caché en memoria con TTL configurable via CACHE_TTL_SECONDS.
 * Usado para endpoints de agregación pesada (/api/summary, /api/trend)
 * que no necesitan datos en tiempo real al segundo.
 */
const cache = new NodeCache({
  stdTTL: env.CACHE_TTL_SECONDS,
  checkperiod: Math.ceil(env.CACHE_TTL_SECONDS * 0.2),
  useClones: false,
});

module.exports = cache;
