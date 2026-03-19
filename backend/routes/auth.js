const router = require('express').Router();
const auth   = require('../middleware/auth');

// GET /api/auth/me — returns Clerk user info
router.get('/me', auth, (req, res) => {
  res.json({
    userId:   req.auth.userId,
    name:     req.auth.name,
    email:    req.auth.email,
    imageUrl: req.auth.imageUrl,
  });
});

module.exports = router;
