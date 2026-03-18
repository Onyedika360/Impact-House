const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const auth    = require('../middleware/auth');

const sign = (admin) =>
  jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// POST /api/auth/register  (first-time setup or invite)
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required.' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      'INSERT INTO admins (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, role',
      [name, email, hash]
    );
    res.status(201).json({ token: sign(rows[0]), admin: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered.' });
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required.' });

  try {
    const { rows } = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const admin = rows[0];
    res.json({ token: sign(admin), admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, email, role, created_at FROM admins WHERE id = $1',
    [req.admin.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Admin not found.' });
  res.json(rows[0]);
});

module.exports = router;
