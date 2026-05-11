const router = require('express').Router();
const { createClerkClient } = require('@clerk/backend');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// POST /api/invitations — admin creates a Clerk invitation
router.post('/', auth, requireRole('admin'), async (req, res) => {
  const { email, role = 'editor' } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'email is required.' });
  if (!['admin', 'editor'].includes(role))
    return res.status(400).json({ error: 'role must be admin or editor.' });

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length)
    return res.status(409).json({ error: 'This email already has an account.' });

  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: normalizedEmail,
      redirectUrl: `${process.env.FRONTEND_URL}/accept-invite`,
      publicMetadata: { role },
    });

    await db.query(
      `INSERT INTO invitations (clerk_invitation_id, email, role, invited_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_invitation_id) DO NOTHING`,
      [invitation.id, normalizedEmail, role, req.user.id]
    );

    res.status(201).json({ success: true, email: normalizedEmail, role });
  } catch (err) {
    const detail = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err.message;
    res.status(500).json({ error: `Failed to send invitation: ${detail}` });
  }
});

// GET /api/invitations — list pending invitations (admin only)
router.get('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT i.*, u.name AS invited_by_name
       FROM invitations i
       LEFT JOIN users u ON i.invited_by = u.id
       WHERE i.revoked_at IS NULL
       ORDER BY i.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch invitations.' });
  }
});

// DELETE /api/invitations/:id — revoke an invite (admin only)
router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT clerk_invitation_id FROM invitations WHERE id = $1 AND revoked_at IS NULL',
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Invitation not found or already revoked.' });

    await clerkClient.invitations.revokeInvitation(rows[0].clerk_invitation_id);
    await db.query('UPDATE invitations SET revoked_at = NOW() WHERE id = $1', [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    const detail = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err.message;
    res.status(500).json({ error: `Failed to revoke invitation: ${detail}` });
  }
});

module.exports = router;
