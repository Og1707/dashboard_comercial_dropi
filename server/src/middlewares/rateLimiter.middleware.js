'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter general: 60 peticiones por minuto por IP.
 * Protege todos los endpoints /api/* contra abuso.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas peticiones. Intente nuevamente en un minuto.',
  },
});

module.exports = { apiLimiter };
