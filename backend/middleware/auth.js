const { createClerkClient } = require('@clerk/backend');

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    // Verify the Clerk session token
    const payload = await clerk.verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    req.auth = { userId: payload.sub };

    // Fetch full user details from Clerk
    try {
      const user = await clerk.users.getUser(payload.sub);
      req.auth.email    = user.emailAddresses?.[0]?.emailAddress;
      req.auth.name     = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Admin';
      req.auth.imageUrl = user.imageUrl;
    } catch (_) {}

    next();
  } catch (err) {
    console.error('Clerk auth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
};
