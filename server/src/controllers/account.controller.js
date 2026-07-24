'use strict';

const accountService = require('../services/account.service');

const getAccounts = async (req, res, next) => {
  try {
    const accounts = await accountService.getAccounts();
    res.json({ accounts });
  } catch (err) {
    next(err);
  }
};

const getAccountData = async (req, res, next) => {
  try {
    const { name } = req.validated_params;
    const { from, to } = req.validated_query;
    const data = await accountService.getAccountData(from, to, name);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = { getAccounts, getAccountData };
