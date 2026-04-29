require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes      = require('./routes/auth');
const memberRoutes    = require('./routes/members');
const messageRoutes   = require('./routes/messages');
const statsRoutes     = require('./routes/stats');
const templateRoutes  = require('./routes/templates');
const publicRoutes    = require('./routes/public');
const { startScheduler } = require('./scheduler');

const app  = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. curl, Render health checks)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/api/auth',      authRoutes);
app.use('/api/members',   memberRoutes);
app.use('/api/messages',  messageRoutes);
app.use('/api/stats',     statsRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/public',    publicRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use((_, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, req, res, _next) => { console.error(err.stack); res.status(500).json({ error: 'Internal server error.' }); });

app.listen(PORT, () => {
  console.log(`\n🏛  Impact House House Church API — port ${PORT}\n`);
  startScheduler();
});
