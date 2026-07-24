'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Serie temporal de envíos agrupada por día y proceso.
 * Opcionalmente filtrada por país (nombre_pais).
 *
 * @param {string} from - Fecha inicio YYYY-MM-DD
 * @param {string} to   - Fecha fin YYYY-MM-DD
 * @param {string|null} country - nombre_pais o null para todos
 * @returns {Array} [{fecha_dia, proceso, total}]
 */
const getTrendSeries = async (from, to, country = null) => {
  const params = [from, to];
  let countryFilter = '';

  if (country && country !== 'Todos') {
    params.push(country);
    countryFilter = `AND p.nombre_pais = $${params.length}`;
  }

  const sql = `
    SELECT
      DATE(m.fecha_envio)         AS fecha_dia,
      dte.nombre_tipo_envio       AS proceso,
      COUNT(m.id_mensaje)         AS total
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    INNER JOIN ${SCHEMA}.paises p ON m.id_pais = p.id_pais
    WHERE m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
      ${countryFilter}
    GROUP BY DATE(m.fecha_envio), dte.nombre_tipo_envio
    ORDER BY fecha_dia ASC, proceso ASC
  `;

  const { rows } = await db.query(sql, params);
  return rows;
};

module.exports = { getTrendSeries };
