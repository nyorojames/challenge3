import { ZodError } from 'zod';

// Throw this from any route or service to send a specific status code.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

// Express 5 sends errors from async handlers here automatically.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid input',
      details: err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  // PostgreSQL error codes: https://www.postgresql.org/docs/16/errcodes-appendix.html
  if (err.code === '23505') {
    return res.status(409).json({ error: 'That already exists', detail: err.detail });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Refers to a record that does not exist' });
  }
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'Invalid id or value format' });
  }

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}
