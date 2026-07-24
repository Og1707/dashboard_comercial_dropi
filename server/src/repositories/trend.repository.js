'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Serie temporal de envíos agrupada por día y proceso.
 * Genera el payload listo para renderizar gráficos de tendencia (Multi-series / Líneas).
 *
 * @param {string} from - Fecha inicio YYYY-MM-DD
 * @param {string} to   - Fecha fin YYYY-MM-DD
 * @param {string|null} country - nombre_pais o null/'Todos' para consolidado global
 * @returns {Promise<Array<{fecha_dia: string, proceso: string, total: number}>>}
 */
const getTrendSeries = async (from, to, country = null) => {
  const params = [from, to];
  let countryFilter = '';

  if (country && country !== 'Todos') {
    params.push(country);
    countryFilter = `AND dp.nombre_pais = $${params.length}`;
  }

  const sql = `
    SELECT
      TO_CHAR(m.fecha_envio, 'YYYY-MM-DD')    AS fecha_dia,
      COALESCE(dte.nombre_tipo_envio, 'Sin Clasificar') AS proceso,
      COUNT(m.id_mensaje)::integer             AS total
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    INNER JOIN ${SCHEMA}.paises dp ON m.id_pais = dp.id_pais
    WHERE m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
      ${countryFilter}
    GROUP BY TO_CHAR(m.fecha_envio, 'YYYY-MM-DD'), dte.nombre_tipo_envio
    ORDER BY fecha_dia ASC, proceso ASC
  `;

  const { rows } = await db.query(sql, params);
  return rows;
};

module.exports = { getTrendSeries };