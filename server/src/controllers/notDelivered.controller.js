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

module.exports = { getNotDelivered, getFailureReasons };
