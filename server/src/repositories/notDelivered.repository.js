'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Listado paginado de contactos con mensajes no entregados.
 * Une fact_registro_errores + dim_contactos + paises + dim_tipo_envio.
 */
const getNotDelivered = async (from, to, { country, reason, limit, offset }) => {
  const params = [from, to];
  const filters = [];

  if (country) {
    params.push(country);
    filters.push(`p.nombre_pais = $${params.length}`);
  }
  if (reason) {
    params.push(`%${reason}%`);
    filters.push(`e.descripcion_error ILIKE $${params.length}`);
  }

  const whereExtra = filters.length ? 'AND ' + filters.join(' AND ') : '';

  const countSql = `
    SELECT COUNT(*) AS total
    FROM ${SCHEMA}.fact_registro_errores e
    INNER JOIN ${SCHEMA}.paises p ON e.id_pais = p.id_pais
    WHERE e.fecha_error >= $1::date
      AND e.fecha_error < ($2::date + INTERVAL '1 day')
      ${whereExtra}
  `;

  params.push(limit);
  const limitPH = `$${params.length}`;
  params.push(offset);
  const offsetPH = `$${params.length}`;

  const dataSql = `
    SELECT
      c.telefono,
      c.ghl_id                AS contact_id,
      p.nombre_pais           AS country,
      p.codigo_iso2           AS code,
      dte.nombre_tipo_envio   AS process,
      e.codigo_error,
      e.descripcion_error     AS reason,
      e.fecha_error           AS date
    FROM ${SCHEMA}.fact_registro_errores e
    INNER JOIN ${SCHEMA}.paises p ON e.id_pais = p.id_pais
    INNER JOIN ${SCHEMA}.dim_contactos c ON e.id_contacto = c.id_contacto
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON e.id_tipo_envio = dte.id_tipo_envio
    WHERE e.fecha_error >= $1::date
      AND e.fecha_error < ($2::date + INTERVAL '1 day')
      ${whereExtra}
    ORDER BY e.fecha_error DESC
    LIMIT ${limitPH} OFFSET ${offsetPH}
  `;

  const countParams = params.slice(0, params.length - 2);

  const [countResult, dataResult] = await Promise.all([
    db.query(countSql, countParams),
    db.query(dataSql, params),
  ]);

  return {
    total: parseInt(countResult.rows[0].total, 10),
    rows: dataResult.rows,
  };
};

/**
 * Lista de motivos de error únicos para poblar el filtro del dashboard.
 */
const getFailureReasons = async () => {
  const sql = `
    SELECT DISTINCT descripcion_error AS reason
    FROM ${SCHEMA}.fact_registro_errores
    WHERE descripcion_error IS NOT NULL
    ORDER BY reason ASC
  `;
  const { rows } = await db.query(sql, []);
  return rows.map((r) => r.reason);
};

module.exports = { getNotDelivered, getFailureReasons };
