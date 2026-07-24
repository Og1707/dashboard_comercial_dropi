'use strict';

const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
  PORT: z.string().transform(Number).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PG_HOST: z.string().min(1, 'PG_HOST es requerido'),
  PG_PORT: z.string().transform(Number).default('5432'),
  PG_DB: z.string().min(1, 'PG_DB es requerido'),
  PG_USER: z.string().min(1, 'PG_USER es requerido'),
  PG_PASSWORD: z.string().min(1, 'PG_PASSWORD es requerido'),
  PG_SSL: z.string().transform((val) => val === 'true').default('false'),
  CACHE_TTL_SECONDS: z.string().transform(Number).default('60'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error de configuración en variables de entorno:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

module.exports = parsed.data;
