'use strict';

const repo = require('../repositories/trend.repository');
const cache = require('../config/cache');

/**
 * Formatea una fecha Date a "Mes Día" en español (ej. "Jul 20").
 */
const fmtDateEs = (d) => {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const date = new Date(d);
  // Sumar un día para compensar UTC offset
  date.setUTCHours(12);
  return `${meses[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

/**
 * Genera la lista de días entre dos fechas ISO.
 */
const buildDayList = (from, to) => {
  const days = [];
  const current = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
};

/**
 * Transforma las filas planas {fecha_dia, proceso, total} en la estructura
 * que espera el dashboard: { days: [...], series: { proceso: [...] } }
 *
 * - Rellena con 0 los días sin datos para mantener el gráfico alineado.
 */
const getTrend = async (from, to, country = null) => {
  const scope = country && country !== 'Todos' ? country : 'Todos';
  const cacheKey = `trend:${from}:${to}:${scope}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const rows = await repo.getTrendSeries(from, to, scope === 'Todos' ? null : scope);

  const dayList = buildDayList(from, to);
  const dayLabels = dayList.map(fmtDateEs);

  // Identificar todos los procesos presentes en los datos
  const processNames = [...new Set(rows.map((r) => r.proceso))].sort();

  // Construir mapa rápido { 'fecha:proceso' -> total }
  const lookup = {};
  rows.forEach((r) => {
    const key = `${r.fecha_dia.toISOString ? r.fecha_dia.toISOString().slice(0, 10) : String(r.fecha_dia).slice(0, 10)}:${r.proceso}`;
    lookup[key] = parseInt(r.total, 10);
  });

  // Rellenar series con 0 para días sin datos
  const series = {};
  processNames.forEach((proc) => {
    series[proc] = dayList.map((day) => lookup[`${day}:${proc}`] || 0);
  });

  const result = { days: dayLabels, series };
  cache.set(cacheKey, result);
  return result;
};

module.exports = { getTrend };
