// Usage: router.post('/sensitive', auth, requireRole('admin'), handler)
module.exports = function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.user.role !== role)
      return res.status(403).json({ error: `Requires ${role} role.` });
    next();
  };
};
