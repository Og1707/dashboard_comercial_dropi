'use strict';

const repo = require('../repositories/account.repository');

const semaColor = (rate) => {
  const r = parseFloat(rate);
  if (r < 85) return 'red';
  if (r < 93) return 'amber';
  return 'green';
};

const mapProcess = (row) => ({
  name: row.process,
  process: row.process,
  processed: parseInt(row.processed, 10),
  delivered: parseInt(row.delivered, 10),
  failed: parseInt(row.failed, 10),
  rate: parseFloat(row.rate),
  cost: parseFloat(parseFloat(row.cost).toFixed(2)),
  sema: semaColor(row.rate),
});

const getAccounts = async () => repo.getAccounts();

const getAccountData = async (from, to, name, { limit = 10, offset = 0 } = {}) => {
  const [processes, worklistData] = await Promise.all([
    repo.getAccountKpis(from, to, name),
    repo.getAccountWorkList(name, { limit, offset }),
  ]);

  const mappedProcesses = processes.map(mapProcess);

  // KPIs agregados de la cuenta
  const totalProcessed = mappedProcesses.reduce((s, r) => s + r.processed, 0);
  const totalDelivered = mappedProcesses.reduce((s, r) => s + r.delivered, 0);
  const totalCost = mappedProcesses.reduce((s, r) => s + r.cost, 0);
  const globalRate = totalProcessed > 0
    ? parseFloat(((totalDelivered / totalProcessed) * 100).toFixed(1))
    : 0;

  return {
    kpis: {
      processed: totalProcessed,
      delivered: totalDelivered,
      rate: globalRate,
      cost: parseFloat(totalCost.toFixed(2)),
      sema: semaColor(globalRate),
    },
    processes: mappedProcesses,
    worklist: {
      rows: worklistData.rows.map((r) => ({
        phone: r.telefono,
        contactId: r.contact_id || '—',
        process: r.process,
        reason: r.reason || 'Sin descripción',
        date: r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
      })),
      total: worklistData.total,
      limit,
      offset,
    },
  };
};

module.exports = { getAccounts, getAccountData };
