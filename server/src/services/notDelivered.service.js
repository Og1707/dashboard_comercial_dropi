'use strict';

const repo = require('../repositories/notDelivered.repository');

const mapRow = (row) => ({
  phone: row.telefono,
  contactId: row.contact_id || '—',
  country: row.country,
  code: row.code,
  process: row.process,
  errorCode: row.codigo_error,
  reason: row.reason || 'Sin descripción',
  date: row.date ? new Date(row.date).toISOString().slice(0, 10) : null,
});

const getNotDelivered = async (from, to, filters) => {
  const { total, rows } = await repo.getNotDelivered(from, to, filters);
  return {
    total,
    rows: rows.map(mapRow),
    limit: filters.limit,
    offset: filters.offset,
  };
};

const getFailureReasons = async () => repo.getFailureReasons();

module.exports = { getNotDelivered, getFailureReasons };
