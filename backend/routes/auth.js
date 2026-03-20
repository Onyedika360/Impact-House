const router = require('express').Router();
const auth   = require('../middleware/auth');
const { createClerkClient } = require('@clerk/backend');

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// GET /api/auth/me — returns Clerk user info
router.get('/me', auth, async (req, res) => {
  try {
    const user = await clerk.users.getUser(req.auth.userId);
    res.json({
      userId:   req.auth.userId,
      name:     [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Admin',
      email:    user.emailAddresses?.[0]?.emailAddress,
      imageUrl: user.imageUrl,
    });
  } catch(err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

module.exports = router;
