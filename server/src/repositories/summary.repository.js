'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * KPIs globales.
 * processed = SUM(foe.monto_total) — calculado en subquery separada para evitar
 *             producto cartesiano con fact_mensajes_ghl.
 * delivered/failed = COUNT desde fact_mensajes_ghl via id_orden.
 * Filtro temporal sobre foe.fecha_entrega.
 */
const getGlobalKpis = async (from, to) => {
  const sql = `
    WITH ordenes AS (
      SELECT
        foe.id_orden,
        foe.id_pais,
        foe.id_tipo_envio,
        foe.monto_total,
        foe.fecha_entrega
      FROM ${SCHEMA}.fact_ordenes_entregadas foe
      INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON foe.id_tipo_envio = dte.id_tipo_envio
      WHERE foe.fecha_entrega >= $1::date
        AND foe.fecha_entrega < ($2::date + INTERVAL '1 day')
        AND dte.activo = TRUE
    ),
    totales AS (
      SELECT COALESCE(SUM(monto_total), 0) AS processed
      FROM ordenes
    ),
    mensajes AS (
      SELECT
        COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)  AS delivered,
        COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE) AS failed,
        COALESCE(SUM(
          CASE WHEN m.entregado = TRUE THEN COALESCE(t.costo_unitario_usd, 0) ELSE 0 END
        ), 0) AS total_cost
      FROM ordenes o
      INNER JOIN ${SCHEMA}.fact_mensajes_ghl m ON m.id_orden = o.id_orden
      LEFT JOIN ${SCHEMA}.dim_tipo_envio dte ON o.id_tipo_envio = dte.id_tipo_envio
      LEFT JOIN ${SCHEMA}.tarifas_whatsapp t
        ON o.id_pais = t.id_pais
        AND dte.categoria_template = t.categoria_template
        AND t.activo = TRUE
        AND o.fecha_entrega::date BETWEEN t.fecha_vigencia_desde AND COALESCE(t.fecha_vigencia_hasta, '9999-12-31')
    )
    SELECT
      t.processed,
      m.delivered,
      m.failed,
      m.total_cost,
      CASE
        WHEN t.processed = 0 THEN 0
        ELSE ROUND(m.delivered * 100.0 / t.processed, 1)
      END AS rate
    FROM totales t, mensajes m
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows[0];
};

/**
 * Métricas por país.
 * processed = SUM(foe.monto_total) agrupado por país sin JOIN a mensajes.
 * delivered/failed = COUNT desde mensajes agrupado por país.
 */
const getByCountry = async (from, to) => {
  const sql = `
    WITH ordenes AS (
      SELECT
        foe.id_orden,
        foe.id_pais,
        foe.id_tipo_envio,
        foe.monto_total,
        foe.fecha_entrega
      FROM ${SCHEMA}.fact_ordenes_entregadas foe
      INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON foe.id_tipo_envio = dte.id_tipo_envio
      WHERE foe.fecha_entrega >= $1::date
        AND foe.fecha_entrega < ($2::date + INTERVAL '1 day')
        AND dte.activo = TRUE
    ),
    procesados AS (
      SELECT id_pais, SUM(monto_total) AS processed
      FROM ordenes
      GROUP BY id_pais
    ),
    mensajes AS (
      SELECT
        o.id_pais,
        COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)  AS delivered,
        COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE) AS failed,
        COALESCE(SUM(
          CASE WHEN m.entregado = TRUE THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
        ), 0) AS cost
      FROM ordenes o
      INNER JOIN ${SCHEMA}.fact_mensajes_ghl m ON m.id_orden = o.id_orden
      LEFT JOIN ${SCHEMA}.dim_tipo_envio dte ON o.id_tipo_envio = dte.id_tipo_envio
      LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
        ON o.id_pais = tw.id_pais
        AND dte.categoria_template = tw.categoria_template
        AND tw.activo = TRUE
        AND o.fecha_entrega::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
      GROUP BY o.id_pais
    )
    SELECT
      dp.nombre_pais                                        AS name,
      dp.codigo_iso2                                        AS code,
      COALESCE(p.processed, 0)                              AS processed,
      COALESCE(mg.delivered, 0)                             AS delivered,
      COALESCE(mg.failed, 0)                                AS failed,
      COALESCE(mg.cost, 0)                                  AS cost,
      CASE
        WHEN COALESCE(p.processed, 0) = 0 THEN 0
        ELSE ROUND(COALESCE(mg.delivered, 0) * 100.0 / p.processed, 1)
      END                                                   AS rate
    FROM procesados p
    INNER JOIN ${SCHEMA}.paises dp ON p.id_pais = dp.id_pais
    LEFT JOIN mensajes mg ON mg.id_pais = p.id_pais
    ORDER BY rate ASC
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows;
};

/**
 * Métricas por proceso.
 * processed = SUM(foe.monto_total) agrupado por proceso.
 * delivered/failed = COUNT desde mensajes agrupado por proceso.
 */
const getByProcess = async (from, to) => {
  const sql = `
    WITH ordenes AS (
      SELECT
        foe.id_orden,
        foe.id_pais,
        foe.id_tipo_envio,
        foe.monto_total,
        foe.fecha_entrega
      FROM ${SCHEMA}.fact_ordenes_entregadas foe
      INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON foe.id_tipo_envio = dte.id_tipo_envio
      WHERE foe.fecha_entrega >= $1::date
        AND foe.fecha_entrega < ($2::date + INTERVAL '1 day')
        AND dte.activo = TRUE
    ),
    procesados AS (
      SELECT id_tipo_envio, SUM(monto_total) AS processed
      FROM ordenes
      GROUP BY id_tipo_envio
    ),
    mensajes AS (
      SELECT
        o.id_tipo_envio,
        COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)  AS delivered,
        COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE) AS failed,
        COALESCE(SUM(
          CASE WHEN m.entregado = TRUE THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
        ), 0) AS cost
      FROM ordenes o
      INNER JOIN ${SCHEMA}.fact_mensajes_ghl m ON m.id_orden = o.id_orden
      LEFT JOIN ${SCHEMA}.dim_tipo_envio dte ON o.id_tipo_envio = dte.id_tipo_envio
      LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
        ON o.id_pais = tw.id_pais
        AND dte.categoria_template = tw.categoria_template
        AND tw.activo = TRUE
        AND o.fecha_entrega::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
      GROUP BY o.id_tipo_envio
    )
    SELECT
      dte.nombre_tipo_envio                                 AS name,
      dte.categoria_template,
      COALESCE(p.processed, 0)                              AS processed,
      COALESCE(mg.delivered, 0)                             AS delivered,
      COALESCE(mg.failed, 0)                                AS failed,
      COALESCE(mg.cost, 0)                                  AS cost,
      CASE
        WHEN COALESCE(p.processed, 0) = 0 THEN 0
        ELSE ROUND(COALESCE(mg.delivered, 0) * 100.0 / p.processed, 1)
      END                                                   AS rate
    FROM procesados p
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON p.id_tipo_envio = dte.id_tipo_envio
    LEFT JOIN mensajes mg ON mg.id_tipo_envio = p.id_tipo_envio
    ORDER BY rate ASC
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows;
};

/**
 * Auditoría de integridad: subcuentas con órdenes sin mensajes registrados.
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
 * Sin JOIN a mensajes — solo conteo de órdenes por dimensiones.
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
