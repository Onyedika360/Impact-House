const { verifyToken } = require('@clerk/backend');
const db = require('../db');

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ error: 'No token provided.' });

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      clockSkewInMs: 60000,
    });

    // Look up the user in our DB — this is the single source of truth for access
    const { rows } = await db.query(
      `UPDATE users SET last_seen_at = NOW() WHERE clerk_id = $1 AND status = 'active' RETURNING *`,
      [payload.sub]
    );

    if (!rows.length)
      return res.status(403).json({
        error: 'Access denied.',
        hint: 'Your account is not set up yet. Ask an admin to invite you.',
      });

    req.user = rows[0]; // { id, clerk_id, email, name, role, status, ... }
    req.auth = { userId: payload.sub, name: rows[0].name }; // keep backward compat
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
};
