import express from 'express';
import cors from 'cors';
import { pool } from '../db/pool.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import productRoutes from './routes/products.js';
import supplierRoutes from './routes/suppliers.js';
import transactionRoutes from './routes/transactions.js';
import reportRoutes from './routes/reports.js';

// The app is built here and started in server.js, so tests can use it
// with Supertest without opening a real port.
export const app = express();

app.use(cors()); // the Vite dev server runs on a different port
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);

// Everything below needs a logged-in user; req.user.shopId scopes every query.
app.use('/api', requireAuth);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reports', reportRoutes);

app.use(notFound);
app.use(errorHandler);
