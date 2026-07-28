'use strict';

const { z } = require('zod');

const MAX_RANGE_DAYS = 120;
const MAX_LIMIT = 200;

/**
 * Valida un rango de fechas from/to.
 * - Ambas obligatorias, formato YYYY-MM-DD
 * - from <= to
 * - Rango máximo de 120 días
 */
const dateRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  })
  .refine((data) => data.from <= data.to, {
    message: '"from" no puede ser mayor que "to"',
    path: ['from'],
  })
  .refine(
    (data) => {
      const diff = (new Date(data.to) - new Date(data.from)) / (1000 * 60 * 60 * 24);
      return diff <= MAX_RANGE_DAYS;
    },
    {
      message: `El rango máximo permitido es ${MAX_RANGE_DAYS} días`,
      path: ['to'],
    }
  );

const summaryQuerySchema = dateRangeSchema;

const trendQuerySchema = dateRangeSchema.and(
  z.object({
    country: z.string().max(100).optional(),
    subcuenta: z.string().max(200).optional(),
  })
);

const detailQuerySchema = dateRangeSchema.and(
  z.object({
    country: z.string().max(100).optional(),
    process: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
    limit: z.string().transform(Number).pipe(z.number().int().min(1).max(MAX_LIMIT)).default('50'),
    offset: z.string().transform(Number).pipe(z.number().int().min(0)).default('0'),
  })
);

const notDeliveredQuerySchema = dateRangeSchema.and(
  z.object({
    country: z.string().max(100).optional(),
    reason: z.string().max(200).optional(),
    limit: z.string().transform(Number).pipe(z.number().int().min(1).max(MAX_LIMIT)).default('50'),
    offset: z.string().transform(Number).pipe(z.number().int().min(0)).default('0'),
  })
);

const accountParamsSchema = z.object({
  name: z.string().min(1).max(200),
});

const accountQuerySchema = dateRangeSchema.and(
  z.object({
    limit: z.string().transform(Number).pipe(z.number().int().min(1).max(MAX_LIMIT)).default('10'),
    offset: z.string().transform(Number).pipe(z.number().int().min(0)).default('0'),
  })
);

module.exports = {
  summaryQuerySchema,
  trendQuerySchema,
  detailQuerySchema,
  notDeliveredQuerySchema,
  accountParamsSchema,
  accountQuerySchema,
};
