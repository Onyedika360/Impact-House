const { verifyToken } = require('@clerk/backend');

// Comma-separated list of allowed Clerk user IDs, e.g. ALLOWED_CLERK_IDS=user_abc123,user_xyz456
const ALLOWED_IDS = process.env.ALLOWED_CLERK_IDS
  ? process.env.ALLOWED_CLERK_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      clockSkewInMs: 60000, // allow 60s clock difference
    });

    // Access control — only allow listed user IDs
    if (ALLOWED_IDS.length > 0 && !ALLOWED_IDS.includes(payload.sub)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    req.auth = { userId: payload.sub };
    next();
  } catch (err) {
    console.error('Clerk auth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
};
