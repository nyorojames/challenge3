import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/errors.js';
import { phoneSchema } from './schemas.js';

const router = Router();
const BCRYPT_ROUNDS = 10;

const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});

const registerSchema = z.object({
  shop_name: z.string().trim().min(2).max(100),
  location: z.string().trim().max(100).optional(),
  language: z.enum(['sw', 'en']).default('sw'),
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
});

async function loadSession(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.shop_id, u.name, u.phone, u.role,
            s.name AS shop_name, s.phone AS shop_phone, s.location, s.language
       FROM users u JOIN shops s ON s.id = u.shop_id
      WHERE u.id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    user: { id: row.id, name: row.name, phone: row.phone, role: row.role },
    shop: { id: row.shop_id, name: row.shop_name, phone: row.shop_phone, location: row.location, language: row.language },
  };
}

router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { phone, password } = req.body;
  const { rows } = await pool.query(
    'SELECT id, shop_id, role, password_hash FROM users WHERE phone = $1',
    [phone]
  );
  const user = rows[0];
  // Same message for "no such user" and "wrong password", so the API does not
  // reveal which phone numbers have accounts.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Wrong phone number or password');
  }
  res.json({ token: signToken(user), ...(await loadSession(user.id)) });
});

// Creates a new shop and its owner in one go.
router.post('/register', validateBody(registerSchema), async (req, res) => {
  const { shop_name, location, language, name, phone, password } = req.body;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await withTransaction(async (client) => {
    const shop = await client.query(
      'INSERT INTO shops (name, phone, location, language) VALUES ($1, $2, $3, $4) RETURNING id',
      [shop_name, phone, location ?? null, language]
    );
    const created = await client.query(
      `INSERT INTO users (shop_id, name, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, 'owner') RETURNING id, shop_id, role`,
      [shop.rows[0].id, name, phone, passwordHash]
    );
    return created.rows[0];
  });

  res.status(201).json({ token: signToken(user), ...(await loadSession(user.id)) });
});

router.get('/me', requireAuth, async (req, res) => {
  const session = await loadSession(req.user.id);
  if (!session) throw new HttpError(401, 'Account no longer exists');
  res.json(session);
});

export default router;
