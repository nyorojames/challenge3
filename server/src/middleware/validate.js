// Validates req.body with a zod schema and replaces it with the parsed result
// (defaults filled in, unknown fields removed). A failure becomes a ZodError,
// which the error handler turns into a 400 response.
export function validateBody(schema) {
  return (req, res, next) => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}
