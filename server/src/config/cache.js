'use strict';

const NodeCache = require('node-cache');
const env = require('./env');

// ─── Validación defensiva del TTL ─────────────────────────────────────────────
const TTL = parseInt(env.CACHE_TTL_SECONDS, 10);

if (isNaN(TTL) || TTL <= 0) {
  throw new Error(
    `[Cache] CACHE_TTL_SECONDS inválido: "${env.CACHE_TTL_SECONDS}". ` +
    `Debe ser un entero positivo.`
  );
}

// ─── Configuración ────────────────────────────────────────────────────────────
const CHECK_PERIOD = Math.max(Math.ceil(TTL * 0.2), 30); // mínimo 30s de chequeo
const MAX_KEYS     = env.CACHE_MAX_KEYS ?? 500;          // límite de entradas en memoria

/**
 * Caché en memoria con TTL configurable via CACHE_TTL_SECONDS.
 *
 * Usado para endpoints de agregación pesada (/api/summary, /api/trend)
 * que no necesitan datos en tiempo real al segundo.
 *
 * TTL:          ${TTL}s
 * Check period: ${CHECK_PERIOD}s
 * Max keys:     ${MAX_KEYS}
 */
const cache = new NodeCache({
  stdTTL:      TTL,
  checkperiod: CHECK_PERIOD,
  useClones:   false,   // sin deep-copy → mejor performance para objetos grandes
  maxKeys:     MAX_KEYS,
  deleteOnExpire: true, // limpieza activa al expirar
});

// ─── Observabilidad ───────────────────────────────────────────────────────────
cache.on('set',     (key)        => console.debug(`[Cache] SET   → ${key}`));
cache.on('del',     (key)        => console.debug(`[Cache] DEL   → ${key}`));
cache.on('expired', (key, value) => console.debug(`[Cache] EXPIRED → ${key}`));
cache.on('flush',   ()           => console.info('[Cache] FLUSH completo'));

/**
 * Retorna estadísticas actuales del cache.
 * Útil para un endpoint /api/health o logs periódicos.
 *
 * @returns {{ keys: number, hits: number, misses: number, hitRate: string }}
 */
cache.stats = function getStats() {
  const { keys, hits, misses } = this.getStats();
  const total   = hits + misses;
  const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) + '%' : 'N/A';

  return { keys, hits, misses, hitRate };
};

module.exports = cache;