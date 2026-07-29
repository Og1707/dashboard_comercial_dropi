'use strict';

const notDeliveredService = require('../services/notDelivered.service');

const getNotDelivered = async (req, res, next) => {
  try {
    const { from, to, country, reason, limit, offset } = req.validated_query;
    const data = await notDeliveredService.getNotDelivered(from, to, { country, reason, limit, offset });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getFailureReasons = async (req, res, next) => {
  try {
    const reasons = await notDeliveredService.getFailureReasons();
    res.json({ reasons });
  } catch (err) {
    next(err);
  }
};

const exportNotDelivered = async (req, res, next) => {
  try {
    const { from, to, country, reason } = req.validated_query;
    const { buffer, count } = await notDeliveredService.exportNotDeliveredCsv(from, to, { country, reason });

    const filename = `no_entregados_${from}_${to}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Record-Count', count);

    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

module.exports = { getNotDelivered, getFailureReasons, exportNotDelivered };
