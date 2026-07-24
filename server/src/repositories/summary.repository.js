'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * KPIs globales: procesados, entregados, fallidos, tasa, costo estimado.
 * La fuente de verdad de estado es tag_ghl ('mensaje_entregado' / 'mensaje_no_entregado').
 */
const getGlobalKpis = async (from, to) => {
  const sql = `
    SELECT
      COUNT(m.id_mensaje)                                                      AS processed,
      COUNT(m.id_mensaje) FILTER (WHERE m.tag_ghl = 'mensaje_entregado')      AS delivered,
      COUNT(m.id_mensaje) FILTER (WHERE m.tag_ghl = 'mensaje_no_entregado')   AS failed,
      COALESCE(SUM(
        CASE WHEN m.tag_ghl = 'mensaje_entregado' THEN COALESCE(t.costo_unitario_usd, 0) ELSE 0 END
      ), 0)                                                                    AS total_cost
    FROM ${SCHEMA}.fact_mensajes_ghl m
    LEFT JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp t
      ON m.id_pais = t.id_pais
      AND dte.categoria_template = t.categoria_template
      AND t.activo = TRUE
      AND $1::date BETWEEN t.fecha_vigencia_desde AND COALESCE(t.fecha_vigencia_hasta, '9999-12-31')
    WHERE m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows[0];
};

/**
 * Métricas agregadas por país, ordenadas de peor a mejor tasa.
 */
const getByCountry = async (from, to) => {
  const sql = `
    SELECT
      p.id_pais,
      p.nombre_pais                                                              AS name,
      p.codigo_iso2                                                              AS code,
      COUNT(m.id_mensaje)                                                        AS processed,
      COUNT(m.id_mensaje) FILTER (WHERE m.tag_ghl = 'mensaje_entregado')        AS delivered,
      COUNT(m.id_mensaje) FILTER (WHERE m.tag_ghl = 'mensaje_no_entregado')     AS failed,
      CASE
        WHEN COUNT(m.id_mensaje) = 0 THEN 0
        ELSE ROUND(
          COUNT(m.id_mensaje) FILTER (WHERE m.tag_ghl = 'mensaje_entregado')
          * 100.0 / COUNT(m.id_mensaje), 1
        )
      END                                                                        AS rate,
      COALESCE(SUM(
        CASE WHEN m.tag_ghl = 'mensaje_entregado' THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
      ), 0)                                                                      AS cost
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.paises p ON m.id_pais = p.id_pais
    LEFT JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
      ON m.id_pais = tw.id_pais
      AND dte.categoria_template = tw.categoria_template
      AND tw.activo = TRUE
      AND $1::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
    WHERE m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
    GROUP BY p.id_pais, p.nombre_pais, p.codigo_iso2
    ORDER BY rate ASC
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows;
};

/**
 * Métricas agregadas por proceso (tipo de envío), ordenadas de peor a mejor tasa.
 */
const getByProcess = async (from, to) => {
  const sql = `
    SELECT
      dte.id_tipo_envio,
      dte.nombre_tipo_envio                                                       AS name,
      dte.categoria_template,
      COUNT(m.id_mensaje)                                                         AS processed,
      COUNT(m.id_mensaje) FILTER (WHERE m.tag_ghl = 'mensaje_entregado')         AS delivered,
      COUNT(m.id_mensaje) FILTER (WHERE m.tag_ghl = 'mensaje_no_entregado')      AS failed,
      CASE
        WHEN COUNT(m.id_mensaje) = 0 THEN 0
        ELSE ROUND(
          COUNT(m.id_mensaje) FILTER (WHERE m.tag_ghl = 'mensaje_entregado')
          * 100.0 / COUNT(m.id_mensaje), 1
        )
      END                                                                         AS rate,
      COALESCE(SUM(
        CASE WHEN m.tag_ghl = 'mensaje_entregado' THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
      ), 0)                                                                       AS cost
    FROM ${SCHEMA}.dim_tipo_envio dte
    LEFT JOIN ${SCHEMA}.fact_mensajes_ghl m
      ON m.id_tipo_envio = dte.id_tipo_envio
      AND m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
      ON m.id_pais = tw.id_pais
      AND dte.categoria_template = tw.categoria_template
      AND tw.activo = TRUE
      AND $1::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
    WHERE dte.activo = TRUE
    GROUP BY dte.id_tipo_envio, dte.nombre_tipo_envio, dte.categoria_template
    ORDER BY rate ASC
  `;
  const { rows } = await db.query(sql, [from, to]);
  return rows;
};

/**
 * Integridad del dato: subcuentas donde los conteos no cuadran.
 * Una subcuenta tiene problema si tiene mensajes sin tag_ghl asignado.
 */
const getIntegrityIssues = async (from, to) => {
  const sql = `
    SELECT COUNT(*) AS issues
    FROM (
      SELECT m.id_pais
      FROM ${SCHEMA}.fact_mensajes_ghl m
      WHERE m.fecha_envio >= $1::date
        AND m.fecha_envio < ($2::date + INTERVAL '1 day')
        AND m.tag_ghl IS NULL
      GROUP BY m.id_pais
    ) sub
  `;
  const { rows } = await db.query(sql, [from, to]);
  return parseInt(rows[0].issues, 10);
};

module.exports = { getGlobalKpis, getByCountry, getByProcess, getIntegrityIssues };
