const { verifyToken, createClerkClient } = require('@clerk/backend');
const db = require('../db');

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

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

    let { rows } = await db.query(
      `UPDATE users SET last_seen_at = NOW() WHERE clerk_id = $1 AND status = 'active' RETURNING *`,
      [payload.sub]
    );

    if (!rows.length) {
      // Auto-provision: first authenticated Clerk user becomes admin, rest become editor.
      // Clerk itself is the access guard — only invited/approved users reach here.
      const clerkUser = await clerkClient.users.getUser(payload.sub);
      const email = clerkUser.emailAddresses[0]?.emailAddress || '';
      const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email;

      const { rows: countRows } = await db.query('SELECT COUNT(*) FROM users');
      const metaRole = clerkUser.publicMetadata?.role;
      const role = metaRole || (parseInt(countRows[0].count, 10) === 0 ? 'admin' : 'editor');

      const insert = await db.query(
        `INSERT INTO users (clerk_id, email, name, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (clerk_id) DO UPDATE SET last_seen_at = NOW()
         RETURNING *`,
        [payload.sub, email, name, role]
      );
      rows = insert.rows;
    }

    if (!rows.length)
      return res.status(403).json({ error: 'Access denied.' });

    req.user = rows[0];
    req.auth = { userId: payload.sub, name: rows[0].name };
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
};
