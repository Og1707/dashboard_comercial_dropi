'use strict';

const trendService = require('../services/trend.service');

const getTrend = async (req, res, next) => {
  try {
    const { from, to, country } = req.validated_query;
    const data = await trendService.getTrend(from, to, country);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = { getTrend };
