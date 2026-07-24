'use strict';

const repo = require('../repositories/detail.repository');

/**
 * Mapea una fila del repositorio al DTO del dashboard.
 */
const mapRow = (row) => ({
  code: row.code,
  country: row.country,
  account: row.account,
  process: row.process,
  processed: parseInt(row.processed, 10),
  delivered: parseInt(row.delivered, 10),
  failed: parseInt(row.failed, 10),
  rate: parseFloat(row.rate),
  cost: parseFloat(parseFloat(row.cost).toFixed(2)),
  templateCategory: row.template_category,
});

const getDetail = async (from, to, filters) => {
  const { total, rows } = await repo.getDetail(from, to, filters);
  return {
    total,
    rows: rows.map(mapRow),
    limit: filters.limit,
    offset: filters.offset,
  };
};

module.exports = { getDetail };
