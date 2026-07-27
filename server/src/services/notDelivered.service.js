'use strict';

const repo = require('../repositories/notDelivered.repository');

const mapRow = (row) => ({
  telefono:    row.telefono   || '—',
  contact_id:  row.contact_id || '—',
  country:     row.country    || '—',
  code:        row.code       || '—',
  process:     row.process    || '—',
  template:    row.template   || '—',
  workflow_id: row.workflow_id || '—',
  reason:      row.reason     || '',
  date:        row.date       || null,
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
