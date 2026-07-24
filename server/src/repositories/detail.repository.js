'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Detalle granular: país → subcuenta → proceso con métricas y trazabilidad (workflow_id + plantilla).
 * Soporta filtrado por país, proceso o búsqueda de subcuenta y paginación exacta.
 */
const getDetail = async (from, to, { country, process, search, limit = 20, offset = 0 }) => {
  const params = [from, to];
  const filters = [];

  if (country) {
    params.push(country);
    filters.push(`dp.nombre_pais = $${params.length}`);
  }
  if (process) {
    params.push(process);
    filters.push(`dte.nombre_tipo_envio = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    filters.push(`COALESCE(s.nombre_subcuenta, dp.nombre_pais || ' — Cuenta única') ILIKE $${params.length}`);
  }

  const whereExtra = filters.length ? 'AND ' + filters.join(' AND ') : '';

  // Estructura BASE compartida entre conteo y datos para evitar inconsistencias
  const baseFromWhere = `
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.fact_ordenes_entregadas foe ON m.id_orden = foe.id_orden
    INNER JOIN ${SCHEMA}.paises dp ON m.id_pais = dp.id_pais
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    LEFT JOIN ${SCHEMA}.dim_subcuentas s ON foe.id_subcuenta = s.id_subcuenta
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
      ON m.id_pais = tw.id_pais
      AND dte.categoria_template = tw.categoria_template
      AND tw.activo = TRUE
      AND m.fecha_envio::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
    WHERE m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
      ${whereExtra}
  `;

  // 1. Total EXACTO de filas agrupadas para la paginación
  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
      SELECT 1
      ${baseFromWhere}
      GROUP BY dp.codigo_iso2, dp.nombre_pais, s.nombre_subcuenta, dte.nombre_tipo_envio, dte.nombre_template, m.workflow_id
    ) sub
  `;

  // 2. Query de Datos Paginada
  const dataParams = [...params, limit, offset];
  const limitPlaceholder = `$${dataParams.length - 1}`;
  const offsetPlaceholder = `$${dataParams.length}`;

  const dataSql = `
    SELECT
      dp.codigo_iso2                                                          AS code,
      dp.nombre_pais                                                          AS country,
      COALESCE(s.nombre_subcuenta, dp.nombre_pais || ' — Cuenta única')          AS account,
      dte.nombre_tipo_envio                                                   AS process,
      COUNT(m.id_mensaje)                                                     AS processed,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)                   AS delivered,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE)                  AS failed,
      CASE
        WHEN COUNT(m.id_mensaje) = 0 THEN 0
        ELSE ROUND(
          COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)
          * 100.0 / COUNT(m.id_mensaje), 1
        )
      END                                                                     AS rate,
      COALESCE(SUM(
        CASE WHEN m.entregado = TRUE THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
      ), 0)                                                                   AS cost,
      dte.nombre_template                                                     AS template,
      COALESCE(m.workflow_id, 'N/A')                                           AS workflow_id
    ${baseFromWhere}
    GROUP BY dp.codigo_iso2, dp.nombre_pais, s.nombre_subcuenta, dte.nombre_tipo_envio, dte.nombre_template, m.workflow_id
    ORDER BY rate ASC, dp.nombre_pais ASC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
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

module.exports = { getDetail };