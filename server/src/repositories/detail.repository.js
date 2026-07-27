'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Detalle operativo: subcuenta → proceso con métricas reales.
 * - processed = SUM(foe.monto_total) — total de personas del envío
 * - delivered = COUNT(m.entregado = TRUE)
 * - failed    = COUNT(m.entregado = FALSE)
 * - rate      = delivered / processed * 100
 * Filtro temporal sobre foe.fecha_entrega.
 */
const getDetail = async (from, to, { country, process, search, limit = 50, offset = 0 }) => {
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

  // CTE base: órdenes en el rango filtrado
  const cteBase = `
    WITH ordenes AS (
      SELECT
        foe.id_orden,
        foe.id_subcuenta,
        foe.id_pais,
        foe.id_tipo_envio,
        foe.monto_total,
        foe.fecha_entrega
      FROM ${SCHEMA}.fact_ordenes_entregadas foe
      INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON foe.id_tipo_envio = dte.id_tipo_envio
      INNER JOIN ${SCHEMA}.paises dp ON foe.id_pais = dp.id_pais
      LEFT  JOIN ${SCHEMA}.dim_subcuentas s ON foe.id_subcuenta = s.id_subcuenta
      WHERE foe.fecha_entrega >= $1::date
        AND foe.fecha_entrega < ($2::date + INTERVAL '1 day')
        AND dte.activo = TRUE
        ${whereExtra}
    ),
    -- procesados: SUM(monto_total) agrupado sin tocar mensajes
    procesados AS (
      SELECT
        o.id_subcuenta,
        o.id_tipo_envio,
        SUM(o.monto_total) AS processed
      FROM ordenes o
      GROUP BY o.id_subcuenta, o.id_tipo_envio
    ),
    -- mensajes: conteo de entregados/fallidos y costo
    mensajes AS (
      SELECT
        foe.id_subcuenta,
        m.id_tipo_envio,
        COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)  AS delivered,
        COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE) AS failed,
        COALESCE(SUM(
          CASE WHEN m.entregado = TRUE THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
        ), 0) AS cost
      FROM ordenes o
      INNER JOIN ${SCHEMA}.fact_mensajes_ghl m ON m.id_orden = o.id_orden
      INNER JOIN ${SCHEMA}.fact_ordenes_entregadas foe ON foe.id_orden = o.id_orden
      LEFT  JOIN ${SCHEMA}.dim_tipo_envio dte ON o.id_tipo_envio = dte.id_tipo_envio
      LEFT  JOIN ${SCHEMA}.tarifas_whatsapp tw
        ON o.id_pais = tw.id_pais
        AND dte.categoria_template = tw.categoria_template
        AND tw.activo = TRUE
        AND o.fecha_entrega::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
      GROUP BY foe.id_subcuenta, m.id_tipo_envio
    )
  `;

  // 1. Total exacto de filas para paginación
  const countSql = `
    ${cteBase}
    SELECT COUNT(*) AS total
    FROM procesados
  `;

  // 2. Datos paginados
  const dataParams = [...params, limit, offset];
  const limitPH   = `$${dataParams.length - 1}`;
  const offsetPH  = `$${dataParams.length}`;

  const dataSql = `
    ${cteBase}
    SELECT
      dp.codigo_iso2                                                            AS code,
      dp.nombre_pais                                                            AS country,
      COALESCE(s.nombre_subcuenta, dp.nombre_pais || ' — Cuenta única')        AS account,
      dte.nombre_tipo_envio                                                     AS process,
      p.processed,
      COALESCE(mg.delivered, 0)                                                 AS delivered,
      COALESCE(mg.failed, 0)                                                    AS failed,
      COALESCE(mg.cost, 0)                                                      AS cost,
      CASE
        WHEN p.processed = 0 THEN 0
        ELSE ROUND(COALESCE(mg.delivered, 0) * 100.0 / p.processed, 1)
      END                                                                       AS rate
    FROM procesados p
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON p.id_tipo_envio = dte.id_tipo_envio
    LEFT  JOIN ${SCHEMA}.dim_subcuentas s   ON p.id_subcuenta  = s.id_subcuenta
    LEFT  JOIN ${SCHEMA}.paises dp          ON s.id_pais       = dp.id_pais
    LEFT  JOIN mensajes mg
      ON mg.id_subcuenta  = p.id_subcuenta
      AND mg.id_tipo_envio = p.id_tipo_envio
    ORDER BY rate ASC, dp.nombre_pais ASC
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

module.exports = { getDetail };
