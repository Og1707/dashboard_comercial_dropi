'use strict';

const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const { pool, testConnection } = require('./src/config/db');

const startServer = async () => {
  // Verificar conexión a DB antes de aceptar tráfico
  await testConnection();

  const server = app.listen(env.PORT, () => {
    logger.info(`Servidor en http://localhost:${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`Dashboard en http://localhost:${env.PORT}/dashboard_control_whatsapp.html`);
  });

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`[${signal}] Apagando servidor...`);
    server.close(async () => {
      logger.info('Servidor HTTP cerrado.');
      await pool.end();
      logger.info('Pool de Postgres cerrado.');
      process.exit(0);
    });

    // Forzar cierre si tarda más de 10s
    setTimeout(() => {
      logger.error('Cierre forzado después de 10s');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Capturar errores no manejados para evitar crash silencioso
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException — reiniciando proceso');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection');
  });
};

startServer();
