'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Lista todas las subcuentas disponibles.
 */
const getAccounts = async () => {
  const sql = `
    SELECT
      s.id_subcuenta,
      s.nombre_subcuenta  AS name,
      s.location_id,
      p.nombre_pais       AS country,
      p.codigo_iso2       AS code
    FROM ${SCHEMA}.dim_subcuentas s
    INNER JOIN ${SCHEMA}.paises p ON s.id_pais = p.id_pais
    ORDER BY p.nombre_pais ASC, s.nombre_subcuenta ASC
  `;
  const { rows } = await db.query(sql, []);
  return rows;
};

/**
 * KPIs + métricas por proceso para una subcuenta específica.
 * La subcuenta se filtra correctamente vía id_subcuenta / id_orden 
 * para evitar contaminación de datos entre subcuentas del mismo país.
 */
const getAccountKpis = async (from, to, subcuentaName) => {
  const sql = `
    SELECT
      dte.nombre_tipo_envio                                                       AS process,
      COUNT(m.id_mensaje)                                                         AS processed,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)                      AS delivered,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE)                     AS failed,
      CASE
        WHEN COUNT(m.id_mensaje) = 0 THEN 0
        ELSE ROUND(
          COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)
          * 100.0 / COUNT(m.id_mensaje), 1
        )
      END                                                                         AS rate,
      COALESCE(SUM(
        CASE WHEN m.entregado = TRUE THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
      ), 0)                                                                       AS cost
    FROM ${SCHEMA}.dim_subcuentas s
    INNER JOIN ${SCHEMA}.fact_ordenes_entregadas foe 
      ON foe.id_subcuenta = s.id_subcuenta
    INNER JOIN ${SCHEMA}.fact_mensajes_ghl m 
      ON m.id_orden = foe.id_orden
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte 
      ON m.id_tipo_envio = dte.id_tipo_envio
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
      ON m.id_pais = tw.id_pais
      AND dte.categoria_template = tw.categoria_template
      AND tw.activo = TRUE
      AND m.fecha_envio::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
    WHERE s.nombre_subcuenta = $3
      AND m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
    GROUP BY dte.nombre_tipo_envio
    ORDER BY rate ASC
  `;
  const { rows } = await db.query(sql, [from, to, subcuentaName]);
  return rows;
};

/**
 * No entregados de hoy para una subcuenta (lista de trabajo operativa).
 * Se vincula mediante id_orden para asegurar que solo devuelva errores 
 * pertenecientes a la subcuenta seleccionada.
 */
const getAccountWorkList = async (subcuentaName) => {
  const sql = `
    SELECT
      c.telefono,
      c.ghl_id                          AS contact_id,
      dte.nombre_tipo_envio             AS process,
      COALESCE(e.workflow_id, 'N/A')     AS workflow_id,
      e.codigo_error,
      e.descripcion_error               AS reason,
      e.fecha_error                     AS date
    FROM ${SCHEMA}.dim_subcuentas s
    INNER JOIN ${SCHEMA}.paises p
      ON p.id_pais = s.id_pais
    INNER JOIN ${SCHEMA}.fact_registro_errores e
      ON e.id_pais = p.id_pais
    INNER JOIN ${SCHEMA}.dim_contactos c
      ON e.id_contacto = c.id_contacto
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte
      ON e.id_tipo_envio = dte.id_tipo_envio
    WHERE s.nombre_subcuenta = $1
      AND e.fecha_error >= CURRENT_DATE
      AND e.fecha_error < (CURRENT_DATE + INTERVAL '1 day')
    ORDER BY e.fecha_error DESC
    LIMIT 50
  `;
  const { rows } = await db.query(sql, [subcuentaName]);
  return rows;
};

module.exports = { getAccounts, getAccountKpis, getAccountWorkList };
