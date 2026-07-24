'use strict';

const express = require('express');
const router = express.Router();

const { validate } = require('../middlewares/validate.middleware');
const {
  summaryQuerySchema,
  trendQuerySchema,
  detailQuerySchema,
  notDeliveredQuerySchema,
  accountParamsSchema,
  accountQuerySchema,
} = require('../schemas/query.schema');

const summaryCtrl = require('../controllers/summary.controller');
const trendCtrl = require('../controllers/trend.controller');
const detailCtrl = require('../controllers/detail.controller');
const notDeliveredCtrl = require('../controllers/notDelivered.controller');
const accountCtrl = require('../controllers/account.controller');

// ── Summary ──────────────────────────────────────────────────────────────────
router.get('/summary', validate(summaryQuerySchema), summaryCtrl.getSummary);

// ── Trend ────────────────────────────────────────────────────────────────────
router.get('/trend', validate(trendQuerySchema), trendCtrl.getTrend);

// ── Detail ───────────────────────────────────────────────────────────────────
router.get('/detail', validate(detailQuerySchema), detailCtrl.getDetail);

// ── Not Delivered ─────────────────────────────────────────────────────────────
router.get('/not-delivered', validate(notDeliveredQuerySchema), notDeliveredCtrl.getNotDelivered);
router.get('/not-delivered/reasons', notDeliveredCtrl.getFailureReasons);

// ── Accounts ──────────────────────────────────────────────────────────────────
router.get('/accounts', accountCtrl.getAccounts);
router.get(
  '/account/:name',
  validate(accountParamsSchema, 'params'),
  validate(accountQuerySchema),
  accountCtrl.getAccountData
);

module.exports = router;
