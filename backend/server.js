require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');

const authRoutes    = require('./routes/auth');
const memberRoutes  = require('./routes/members');
const messageRoutes = require('./routes/messages');
const statsRoutes   = require('./routes/stats');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Security middleware ──────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// General rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please wait 15 minutes.' },
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Routes ───────────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/members',  memberRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/stats',    statsRoutes);

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 handler
app.use((_, res) => res.status(404).json({ error: 'Route not found.' }));

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏛  Impact House Church API`);
  console.log(`   Running on port ${PORT}`);
  console.log(`   Env: ${process.env.NODE_ENV || 'development'}\n`);
});
