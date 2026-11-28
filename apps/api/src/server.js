import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRouter from './routes/auth.js';
import publicRouter from './routes/public.js';
import adminRouter from './routes/admin.js';
import { optionalAuth } from './middleware/auth.js';
import { seedContentIfEmpty } from './data/seed.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com', 'https://*.gstatic.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://accounts.google.com'],
      frameSrc: ["'self'", 'https://accounts.google.com'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  }
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// Only same-site (or explicitly configured dev origin) browser writes are accepted.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.headers.origin) return next();
  // WEB_ORIGIN may list several origins, comma-separated (e.g. local Vite + Netlify site).
  const configured = (process.env.WEB_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
  const validOrigins = [...configured, `${req.protocol}://${req.get('host')}`];
  if (validOrigins.includes(req.headers.origin)) return next();
  return res.status(403).json({ error: 'Untrusted request origin.' });
});
app.use('/api', optionalAuth);
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
const signinLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api/auth/google', signinLimiter);
app.use('/api/admin', writeLimiter, adminRouter);
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: true, index: false }));
const distDir = path.resolve(__dirname, '../../web/dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}
app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  if (err instanceof mongoose.Error.CastError) return res.status(400).json({ error: 'Invalid resource identifier.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Images must be smaller than 6 MB.' });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = Number(process.env.PORT || 4000);
if (!process.env.MONGODB_URI) {
  throw new Error('Missing MONGODB_URI. Copy apps/api/.env.example to apps/api/.env and configure it.');
}
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || !process.env.BOOTSTRAP_ADMIN_EMAIL)) {
  throw new Error('Production requires a strong SESSION_SECRET and BOOTSTRAP_ADMIN_EMAIL.');
}
try {
  // Runs once per cold start on Vercel; the connection is reused by later requests on the same instance.
  await mongoose.connect(process.env.MONGODB_URI);
  await seedContentIfEmpty();
} catch (err) {
  console.error('Could not connect to MongoDB:', err.message);
  throw err;
}
// Vercel invokes the exported app as a serverless function; locally/Docker we listen on a port.
if (!process.env.VERCEL) {
  app.listen(port, () => console.info(`Portfolio API listening on http://localhost:${port}`));
}
export default app;
