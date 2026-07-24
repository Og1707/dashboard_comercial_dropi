'use strict';

/**
 * Middleware de validación con Zod.
 * Valida query params o route params antes de llegar al controlador.
 *
 * @param {ZodSchema} schema - Schema de Zod a usar para validar
 * @param {'query'|'params'|'body'} source - Fuente de datos a validar
 */
const validate = (schema, source = 'query') => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({
        error: 'Parámetros inválidos',
        details: errors,
      });
    }
    req[`validated_${source}`] = result.data;
    next();
  };
};

module.exports = { validate };
