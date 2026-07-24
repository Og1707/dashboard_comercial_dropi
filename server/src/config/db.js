'use strict';

const { Pool } = require('pg');
const env = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
  host: env.PG_HOST,
  port: env.PG_PORT,
  database: env.PG_DB,
  user: env.PG_USER,
  password: env.PG_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: env.PG_SSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Error inesperado en cliente inactivo del pool de Postgres');
});

const testConnection = async () => {
  try {
    const client = await pool.connect();
    logger.info('✅ Conexión exitosa con PostgreSQL');
    client.release();
  } catch (err) {
    logger.error({ err }, '❌ Error crítico al conectar a la base de datos');
    process.exit(1);
  }
};

/**
 * Ejecuta una query parametrizada usando el pool.
 * @param {string} text - SQL con placeholders $1, $2, ...
 * @param {Array} params - Valores para los placeholders
 */
const query = (text, params) => pool.query(text, params);

module.exports = { query, pool, testConnection };
