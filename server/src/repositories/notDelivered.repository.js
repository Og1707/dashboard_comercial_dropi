'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Listado paginado de contactos con mensajes no entregados.
 * Incluye trazabilidad operativa completa (plantilla, workflow_id, error y teléfono).
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

  // Cláusula base compartida para asegurar exactitud entre el conteo total y los datos
  const baseFromWhere = `
    FROM ${SCHEMA}.fact_registro_errores e
    INNER JOIN ${SCHEMA}.paises dp ON e.id_pais = dp.id_pais
    INNER JOIN ${SCHEMA}.dim_contactos c ON e.id_contacto = c.id_contacto
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON e.id_tipo_envio = dte.id_tipo_envio
    WHERE e.fecha_error >= $1::date
      AND e.fecha_error < ($2::date + INTERVAL '1 day')
      ${whereExtra}
  `;

  // 1. Total exacto para el paginador
  const countSql = `
    SELECT COUNT(*) AS total
    ${baseFromWhere}
  `;

  // 2. Consulta de datos paginada
  const dataParams = [...params, limit, offset];
  const limitPH = `$${dataParams.length - 1}`;
  const offsetPH = `$${dataParams.length}`;

  const dataSql = `
    SELECT
      c.telefono,
      c.ghl_id                          AS contact_id,
      dp.nombre_pais                    AS country,
      dp.codigo_iso2                    AS code,
      dte.nombre_tipo_envio             AS process,
      dte.nombre_template               AS template,
      COALESCE(e.workflow_id, 'N/A')     AS workflow_id,
      e.codigo_error,
      e.descripcion_error               AS reason,
      e.fecha_error                     AS date
    ${baseFromWhere}
    ORDER BY e.fecha_error DESC
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
 * Lista de motivos de error únicos activos para poblar el filtro desplegable del dashboard.
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

module.exports = { getNotDelivered, getFailureReasons };