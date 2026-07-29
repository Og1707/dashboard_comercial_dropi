'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Listado paginado de contactos con mensajes no entregados.
 * Fuente: fact_mensajes_ghl WHERE entregado = FALSE
 * - telefono / contact_id  → dim_contactos via id_contacto
 * - proceso                → dim_tipo_envio via id_tipo_envio (nombre del proceso)
 * - plantilla / workflow_id → fact_mensajes_ghl.plantilla / workflow_id
 * - motivo de falla        → fact_registro_errores (LEFT JOIN, vacío si no hay error)
 * - fecha                  → fact_mensajes_ghl.fecha_envio
 * Filtro temporal sobre m.fecha_envio.
 */
const getNotDelivered = async (from, to, { country, reason, limit = 50, offset = 0 }) => {
  const params = [from, to];
  const filters = [];

  if (country) {
    params.push(country);
    filters.push(`dp.nombre_pais = $${params.length}`);
  }
  if (reason) {
    params.push(`%${reason}%`);
    filters.push(`e.descripcion_error ILIKE $${params.length}`);
  }

  const whereExtra = filters.length ? 'AND ' + filters.join(' AND ') : '';

  const baseFromWhere = `
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.dim_contactos c   ON m.id_contacto  = c.id_contacto
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    INNER JOIN ${SCHEMA}.paises dp          ON m.id_pais       = dp.id_pais
    LEFT  JOIN ${SCHEMA}.fact_registro_errores e
      ON e.id_contacto   = m.id_contacto
      AND e.id_tipo_envio = m.id_tipo_envio
      AND e.fecha_error::date = m.fecha_envio::date
    WHERE m.entregado = FALSE
      AND m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      ${whereExtra}
  `;

  const countSql = `SELECT COUNT(*) AS total ${baseFromWhere}`;

  const dataParams = [...params, limit, offset];
  const limitPH  = `$${dataParams.length - 1}`;
  const offsetPH = `$${dataParams.length}`;

  const dataSql = `
    SELECT
      c.telefono,
      c.ghl_id                                AS contact_id,
      dp.nombre_pais                          AS country,
      dp.codigo_iso2                          AS code,
      dte.nombre_tipo_envio                   AS process,
      COALESCE(m.plantilla, '—')                AS template,
      COALESCE(m.workflow_id, '—')            AS workflow_id,
      COALESCE(e.descripcion_error, 'Desconocido')       AS reason,
      m.fecha_envio                           AS date
    ${baseFromWhere}
    ORDER BY m.fecha_envio DESC
    LIMIT ${limitPH} OFFSET ${offsetPH}
  `;

  const [countResult, dataResult] = await Promise.all([
    db.query(countSql, params),
    db.query(dataSql, dataParams),
  ]);

  return {
    total: parseInt(countResult.rows[0]?.total || 0, 10),
    rows: dataResult.rows,
  };
};

/**
 * Lista de motivos de error únicos para el filtro desplegable.
 */
const getFailureReasons = async () => {
  const sql = `
    SELECT DISTINCT descripcion_error AS reason
    FROM ${SCHEMA}.fact_registro_errores
    WHERE descripcion_error IS NOT NULL
      AND TRIM(descripcion_error) <> ''
    ORDER BY reason ASC
  `;
  const { rows } = await db.query(sql, []);
  return rows.map((r) => r.reason);
};

/**
 * Todos los contactos no entregados para exportación CSV (sin paginación).
 * Reutiliza la misma lógica de filtros que getNotDelivered pero sin LIMIT/OFFSET.
 */
const getNotDeliveredForExport = async (from, to, { country, reason } = {}) => {
  const params = [from, to];
  const filters = [];

  if (country) {
    params.push(country);
    filters.push(`dp.nombre_pais = $${params.length}`);
  }
  if (reason) {
    params.push(`%${reason}%`);
    filters.push(`e.descripcion_error ILIKE $${params.length}`);
  }

  const whereExtra = filters.length ? 'AND ' + filters.join(' AND ') : '';

  const sql = `
    SELECT
      c.telefono,
      c.ghl_id                                          AS contact_id,
      dp.nombre_pais                                    AS country,
      dp.codigo_iso2                                    AS code,
      dte.nombre_tipo_envio                             AS process,
      COALESCE(m.plantilla, '—')                        AS template,
      COALESCE(m.workflow_id, '—')                      AS workflow_id,
      COALESCE(e.descripcion_error, 'Desconocido')      AS reason,
      m.fecha_envio                                     AS date
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.dim_contactos c    ON m.id_contacto  = c.id_contacto
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    INNER JOIN ${SCHEMA}.paises dp          ON m.id_pais       = dp.id_pais
    LEFT  JOIN ${SCHEMA}.fact_registro_errores e
      ON e.id_contacto    = m.id_contacto
      AND e.id_tipo_envio = m.id_tipo_envio
      AND e.fecha_error::date = m.fecha_envio::date
    WHERE m.entregado = FALSE
      AND m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      ${whereExtra}
    ORDER BY m.fecha_envio DESC
  `;

  const { rows } = await db.query(sql, params);
  return rows;
};

module.exports = { getNotDelivered, getFailureReasons, getNotDeliveredForExport };
