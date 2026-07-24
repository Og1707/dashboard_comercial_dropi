'use strict';

const repo = require('../repositories/summary.repository');
const cache = require('../config/cache');

/**
 * Determina el color del semáforo según la tasa de entrega.
 * Rojo <85%, Ámbar 85-93%, Verde >93%
 */
const semaColor = (rate) => {
  const r = parseFloat(rate);
  if (r < 85) return 'red';
  if (r < 93) return 'amber';
  return 'green';
};

/**
 * Mapea una fila de país del repositorio al DTO esperado por el dashboard.
 */
const mapCountry = (row) => ({
  code: row.code,
  name: row.name,
  processed: parseInt(row.processed, 10),
  delivered: parseInt(row.delivered, 10),
  failed: parseInt(row.failed, 10),
  rate: parseFloat(row.rate),
  cost: parseFloat(row.cost),
  sema: semaColor(row.rate),
});

/**
 * Mapea una fila de proceso al DTO esperado por el dashboard.
 */
const mapProcess = (row) => ({
  name: row.name,
  templateCategory: row.categoria_template,
  processed: parseInt(row.processed, 10),
  delivered: parseInt(row.delivered, 10),
  failed: parseInt(row.failed, 10),
  rate: parseFloat(row.rate),
  cost: parseFloat(row.cost),
  sema: semaColor(row.rate),
  validation: false,
});

/**
 * Obtiene KPIs globales + rankings por país y proceso.
 * Resultado cacheado por TTL configurado en CACHE_TTL_SECONDS.
 */
const getSummary = async (from, to) => {
  const cacheKey = `summary:${from}:${to}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const [kpisRaw, countriesRaw, processesRaw, integrityIssues] = await Promise.all([
    repo.getGlobalKpis(from, to),
    repo.getByCountry(from, to),
    repo.getByProcess(from, to),
    repo.getIntegrityIssues(from, to),
  ]);

  const processed = parseInt(kpisRaw.processed, 10);
  const delivered = parseInt(kpisRaw.delivered, 10);
  const globalRate = processed > 0 ? parseFloat(((delivered / processed) * 100).toFixed(1)) : 0;

  const result = {
    kpis: {
      processed,
      delivered,
      failed: parseInt(kpisRaw.failed, 10),
      rate: globalRate,
      cost: parseFloat(parseFloat(kpisRaw.total_cost).toFixed(2)),
      sema: semaColor(globalRate),
      integrityIssues,
    },
    countries: countriesRaw.map(mapCountry),
    processes: processesRaw.map(mapProcess),
  };

  cache.set(cacheKey, result);
  return result;
};

module.exports = { getSummary };
