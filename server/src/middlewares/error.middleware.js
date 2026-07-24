'use strict';

const logger = require('../utils/logger');

/**
 * Manejador centralizado de errores.
 * Captura cualquier error no manejado en los controllers/services.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Error no manejado');

  // Errores de Postgres
  if (err.code && err.code.startsWith('2') || err.code && err.code.startsWith('4') || err.code && err.code.startsWith('5')) {
    return res.status(503).json({
      error: 'Error de base de datos',
      message: 'No fue posible completar la consulta. Intente nuevamente.',
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.expose ? err.message : 'Error interno del servidor';

  res.status(statusCode).json({ error: message });
};

module.exports = { errorHandler };
