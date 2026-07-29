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

/**
 * Rate limiter para exportación CSV: máximo 10 exportaciones por IP cada 5 minutos.
 * Evita que una sola IP abuse del endpoint que genera consultas sin paginación.
 */
const exportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Límite de exportaciones alcanzado. Intente nuevamente en 5 minutos.',
  },
});

module.exports = { apiLimiter, exportLimiter };
