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

/**
 * Escapa un valor para incluirlo en una celda CSV:
 * - Convierte null/undefined a cadena vacía
 * - Envuelve en comillas dobles si contiene comas, saltos de línea o comillas
 * - Duplica comillas internas para conformidad RFC 4180
 */
const escapeCsvField = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Formatea una fecha ISO a string legible en zona horaria UTC.
 * Ejemplo: "2026-07-29T10:15:22.000Z" → "2026-07-29 10:15:22"
 */
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toISOString().replace('T', ' ').slice(0, 19);
};

const CSV_HEADERS = [
  'Teléfono',
  'Contact ID',
  'País',
  'Código País',
  'Proceso',
  'Plantilla',
  'Workflow ID',
  'Motivo de Fallo',
  'Fecha',
];

/**
 * Genera el contenido CSV completo (con BOM UTF-8 para compatibilidad con Excel).
 * Retorna un Buffer listo para enviar como respuesta HTTP.
 */
const buildCsvBuffer = (rows) => {
  const lines = [CSV_HEADERS.join(',')];

  for (const row of rows) {
    lines.push([
      escapeCsvField(row.telefono),
      escapeCsvField(row.contact_id),
      escapeCsvField(row.country),
      escapeCsvField(row.code),
      escapeCsvField(row.process),
      escapeCsvField(row.template),
      escapeCsvField(row.workflow_id),
      escapeCsvField(row.reason),
      escapeCsvField(formatDate(row.date)),
    ].join(','));
  }

  // BOM UTF-8 (\uFEFF) garantiza que Excel abra el archivo con encoding correcto
  const csvContent = '\uFEFF' + lines.join('\r\n');
  return Buffer.from(csvContent, 'utf8');
};

/**
 * Obtiene todos los registros (sin paginación) y retorna el CSV como Buffer.
 */
const exportNotDeliveredCsv = async (from, to, filters) => {
  const rows = await repo.getNotDeliveredForExport(from, to, filters);
  const mappedRows = rows.map(mapRow);
  return {
    buffer: buildCsvBuffer(mappedRows),
    count: mappedRows.length,
  };
};

module.exports = { getNotDelivered, getFailureReasons, exportNotDeliveredCsv };
