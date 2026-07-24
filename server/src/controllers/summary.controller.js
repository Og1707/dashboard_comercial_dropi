'use strict';

const summaryService = require('../services/summary.service');

const getSummary = async (req, res, next) => {
  try {
    const { from, to } = req.validated_query;
    const data = await summaryService.getSummary(from, to);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = { getSummary };
