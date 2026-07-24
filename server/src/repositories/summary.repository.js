'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * KPIs globales.
 * - processed = SUM(foe.monto_total): total de personas a las que se intentó enviar
 * - delivered = COUNT(m.entregado = TRUE): mensajes confirmados como entregados
 * - failed    = COUNT(m.entregado = FALSE): mensajes no entregados
 * - rate      = delivered / processed * 100
 * Filtro temporal sobre foe.fecha_entrega.
 */
const getGlobalKpis = async (from, to) => {
  const sql = `
    SELECT
      COALESCE(SUM(foe.monto_total), 0)                                       AS processed,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)                   AS delivered,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE)                  AS failed,
      CASE
        WHEN COALESCE(SUM(foe.monto_total), 0) = 0 THEN 0
        ELSE ROUND(
          COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)
          * 100.0 / SUM(foe.monto_total), 1
        )
      END                                                                     AS rate,
      COALESCE(SUM(
        CASE WHEN m.entregado = TRUE THEN COALESCE(t.costo_unitario_usd, 0) ELSE 0 END
      ), 0)                                                                   AS total_cost
    FROM ${SCHEMA}.fact_ordenes_entregadas foe
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON foe.id_tipo_envio = dte.id_tipo_envio
    LEFT JOIN ${SCHEMA}.fact_mensajes_ghl m ON m.id_orden = foe.id_orden
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp t
      ON foe.id_pais = t.id_pais
      AND dte.categoria_template = t.categoria_template
      AND t.activo = TRUE
      AND foe.fecha_entrega::date BETWEEN t.fecha_vigencia_desde AND COALESCE(t.fecha_vigencia_hasta, '9999-12-31')
    WHERE foe.fecha_entrega >= $1::date
      AND foe.fecha_entrega < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows[0];
};

/**
 * Métricas agregadas por país, ordenadas de peor a mejor tasa de entrega.
 * processed = SUM(foe.monto_total) por país.
 */
const getByCountry = async (from, to) => {
  const sql = `
    SELECT
      dp.nombre_pais                                                          AS name,
      dp.codigo_iso2                                                          AS code,
      COALESCE(SUM(foe.monto_total), 0)                                       AS processed,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)                   AS delivered,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE)                  AS failed,
      CASE
        WHEN COALESCE(SUM(foe.monto_total), 0) = 0 THEN 0
        ELSE ROUND(
          COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)
          * 100.0 / SUM(foe.monto_total), 1
        )
      END                                                                     AS rate,
      COALESCE(SUM(
        CASE WHEN m.entregado = TRUE THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
      ), 0)                                                                   AS cost
    FROM ${SCHEMA}.fact_ordenes_entregadas foe
    INNER JOIN ${SCHEMA}.paises dp ON foe.id_pais = dp.id_pais
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON foe.id_tipo_envio = dte.id_tipo_envio
    LEFT JOIN ${SCHEMA}.fact_mensajes_ghl m ON m.id_orden = foe.id_orden
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
      ON foe.id_pais = tw.id_pais
      AND dte.categoria_template = tw.categoria_template
      AND tw.activo = TRUE
      AND foe.fecha_entrega::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
    WHERE foe.fecha_entrega >= $1::date
      AND foe.fecha_entrega < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
    GROUP BY dp.nombre_pais, dp.codigo_iso2
    ORDER BY rate ASC
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows;
};

/**
 * Métricas agregadas por proceso, ordenadas de peor a mejor tasa de entrega.
 * processed = SUM(foe.monto_total) por proceso.
 */
const getByProcess = async (from, to) => {
  const sql = `
    SELECT
      dte.nombre_tipo_envio                                                   AS name,
      dte.categoria_template,
      COALESCE(SUM(foe.monto_total), 0)                                       AS processed,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)                   AS delivered,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE)                  AS failed,
      CASE
        WHEN COALESCE(SUM(foe.monto_total), 0) = 0 THEN 0
        ELSE ROUND(
          COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)
          * 100.0 / SUM(foe.monto_total), 1
        )
      END                                                                     AS rate,
      COALESCE(SUM(
        CASE WHEN m.entregado = TRUE THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
      ), 0)                                                                   AS cost
    FROM ${SCHEMA}.dim_tipo_envio dte
    INNER JOIN ${SCHEMA}.fact_ordenes_entregadas foe
      ON foe.id_tipo_envio = dte.id_tipo_envio
      AND foe.fecha_entrega >= $1::date
      AND foe.fecha_entrega < ($2::date + INTERVAL '1 day')
    LEFT JOIN ${SCHEMA}.fact_mensajes_ghl m ON m.id_orden = foe.id_orden
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
      ON foe.id_pais = tw.id_pais
      AND dte.categoria_template = tw.categoria_template
      AND tw.activo = TRUE
      AND foe.fecha_entrega::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
    WHERE dte.activo = TRUE
    GROUP BY dte.nombre_tipo_envio, dte.categoria_template
    ORDER BY rate ASC
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows;
};

/**
 * Auditoría de integridad: subcuentas donde hay órdenes sin mensajes registrados.
 */
const getIntegrityIssues = async (from, to) => {
  const sql = `
    SELECT COUNT(*) AS issues
    FROM (
      SELECT foe.id_subcuenta
      FROM ${SCHEMA}.fact_ordenes_entregadas foe
      LEFT JOIN ${SCHEMA}.fact_mensajes_ghl m ON m.id_orden = foe.id_orden
      WHERE foe.fecha_entrega >= $1::date
        AND foe.fecha_entrega < ($2::date + INTERVAL '1 day')
        AND m.id_mensaje IS NULL
      GROUP BY foe.id_subcuenta
    ) sub
  `;
  const { rows } = await db.query(sql, [from, to]);
  return parseInt(rows[0]?.issues || 0, 10);
};

/**
 * Cruce país × proceso: SUM(monto_total) para el heatmap.
 */
const getByCountryProcess = async (from, to) => {
  const sql = `
    SELECT
      dp.nombre_pais                            AS country_name,
      dp.codigo_iso2                            AS country_code,
      dte.nombre_tipo_envio                     AS process_name,
      COALESCE(SUM(foe.monto_total), 0)::integer AS processed
    FROM ${SCHEMA}.fact_ordenes_entregadas foe
    INNER JOIN ${SCHEMA}.paises dp ON foe.id_pais = dp.id_pais
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON foe.id_tipo_envio = dte.id_tipo_envio
    WHERE foe.fecha_entrega >= $1::date
      AND foe.fecha_entrega < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
    GROUP BY dp.nombre_pais, dp.codigo_iso2, dte.nombre_tipo_envio
    ORDER BY dp.nombre_pais ASC, dte.nombre_tipo_envio ASC
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows;
};

module.exports = { getGlobalKpis, getByCountry, getByProcess, getIntegrityIssues, getByCountryProcess };
