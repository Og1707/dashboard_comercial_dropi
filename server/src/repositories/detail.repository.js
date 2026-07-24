'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Detalle granular: país → subcuenta → proceso con métricas y trazabilidad.
 * Filtra opcionalmente por país, proceso o búsqueda de subcuenta.
 * Paginado con limit/offset seguros.
 */
const getDetail = async (from, to, { country, process, search, limit, offset }) => {
  const params = [from, to];
  const filters = [];

  if (country) {
    params.push(country);
    filters.push(`p.nombre_pais = $${params.length}`);
  }
  if (process) {
    params.push(process);
    filters.push(`dte.nombre_tipo_envio = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    filters.push(`s.nombre_subcuenta ILIKE $${params.length}`);
  }

  const whereExtra = filters.length ? 'AND ' + filters.join(' AND ') : '';

  // Total para paginación
  const countSql = `
    SELECT COUNT(DISTINCT (m.id_pais, m.id_tipo_envio)) AS total
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.paises p ON m.id_pais = p.id_pais
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    LEFT JOIN ${SCHEMA}.dim_subcuentas s ON s.id_pais = m.id_pais
    WHERE m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
      ${whereExtra}
  `;

  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  params.push(offset);
  const offsetPlaceholder = `$${params.length}`;

  const dataSql = `
    SELECT
      p.codigo_iso2                                                              AS code,
      p.nombre_pais                                                              AS country,
      COALESCE(s.nombre_subcuenta, p.nombre_pais || ' — Cuenta única')          AS account,
      dte.nombre_tipo_envio                                                      AS process,
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
      ), 0)                                                                      AS cost,
      dte.categoria_template                                                     AS template_category
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.paises p ON m.id_pais = p.id_pais
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    LEFT JOIN ${SCHEMA}.dim_subcuentas s ON s.id_pais = m.id_pais
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
      ON m.id_pais = tw.id_pais
      AND dte.categoria_template = tw.categoria_template
      AND tw.activo = TRUE
      AND $1::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
    WHERE m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
      ${whereExtra}
    GROUP BY p.codigo_iso2, p.nombre_pais, s.nombre_subcuenta, dte.nombre_tipo_envio, dte.categoria_template
    ORDER BY rate ASC, p.nombre_pais ASC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;

  const [countResult, dataResult] = await Promise.all([
    db.query(countSql, params.slice(0, params.length - 2)),
    db.query(dataSql, params),
  ]);

  return {
    total: parseInt(countResult.rows[0].total, 10),
    rows: dataResult.rows,
  };
};

module.exports = { getDetail };
