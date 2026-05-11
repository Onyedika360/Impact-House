const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../db');

// GET /api/auth/me — returns the current user's profile + role from our DB
router.get('/me', auth, async (req, res) => {
  res.json({
    id:      req.user.id,
    name:    req.user.name,
    email:   req.user.email,
    role:    req.user.role,
    status:  req.user.status,
  });
});

// GET /api/auth/team — list all team members (admin only, but editors can see the list)
router.get('/team', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, email, role, status, created_at, last_seen_at FROM users ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch team.' });
  }
});

// PATCH /api/auth/team/:id — update role or status (admin only)
router.patch('/team/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Requires admin role.' });

  const { role, status } = req.body;
  const allowed = {};
  if (role   && ['admin','editor'].includes(role))   allowed.role   = role;
  if (status && ['active','suspended'].includes(status)) allowed.status = status;

  if (!Object.keys(allowed).length)
    return res.status(400).json({ error: 'Nothing to update.' });

  // Prevent self-demotion / self-suspension
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'You cannot change your own role or status.' });

  try {
    const sets  = Object.keys(allowed).map((k, i) => `${k} = $${i + 1}`).join(', ');
    const vals  = [...Object.values(allowed), req.params.id];
    const { rows } = await db.query(
      `UPDATE users SET ${sets} WHERE id = $${vals.length} RETURNING id, name, email, role, status`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

module.exports = router;
