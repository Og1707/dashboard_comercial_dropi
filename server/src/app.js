'use strict';

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const logger = require('./utils/logger');
const { apiLimiter } = require('./middlewares/rateLimiter.middleware');
const { errorHandler } = require('./middlewares/error.middleware');
const apiRouter = require('./routes/api.router');

const app = express();

// ── Seguridad ──────────────────────────────────────────────────────────────
// contentSecurityPolicy: false para permitir los assets inline del dashboard.html
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json());

// ── HTTP Logging ───────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// ── Static — sirve dashboard.html ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../..', 'public')));

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api', apiLimiter, apiRouter);

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ── Error handler centralizado ─────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
