import { z } from 'zod';

export function validate(schemaMap) {
  const isSingle = schemaMap && typeof schemaMap.safeParse === 'function';
  const sources = isSingle ? { body: schemaMap } : (schemaMap || {});
  return (req, res, next) => {
    for (const [source, schema] of Object.entries(sources)) {
      const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
      const result = schema.safeParse(data);
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: result.error.flatten().fieldErrors,
          requestId: req.id,
        });
      }
      req[source] = result.data;
    }
    next();
  };
}

export const validateQueryShape = validate({
  query: z.record(z.string(), z.string()),
});

export const validateEmptyBody = validate({ body: z.object({}).strict() });
