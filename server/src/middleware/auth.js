import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './errors.js';

const TOKEN_LIFETIME = '7d'; // a shopkeeper should not have to log in every day

export function signToken(user) {
  return jwt.sign({ sub: user.id, shopId: user.shop_id, role: user.role }, config.JWT_SECRET, {
    expiresIn: TOKEN_LIFETIME,
  });
}

// Expects "Authorization: Bearer <token>". On success, sets req.user = { id, shopId, role }.
// Every route after this uses req.user.shopId to scope its queries.
export function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Not logged in');
  }
  try {
    const payload = jwt.verify(token, config.JWT_SECRET);
    req.user = { id: payload.sub, shopId: payload.shopId, role: payload.role };
    next();
  } catch {
    throw new HttpError(401, 'Session expired, please log in again');
  }
}
