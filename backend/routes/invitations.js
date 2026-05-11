const router = require('express').Router();
const { createClerkClient } = require('@clerk/backend');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

function inviteRedirectUrl() {
  return `${process.env.FRONTEND_URL}/accept-invite`;
}

// POST /api/invitations — admin creates a Clerk invitation
router.post('/', auth, requireRole('admin'), async (req, res) => {
  const { first_name, last_name, email, role = 'editor' } = req.body;
  if (!first_name?.trim() || !last_name?.trim())
    return res.status(400).json({ error: 'First and last name are required.' });
  if (!email?.trim())
    return res.status(400).json({ error: 'email is required.' });
  if (!['admin', 'editor'].includes(role))
    return res.status(400).json({ error: 'role must be admin or editor.' });

  const normalizedEmail = email.toLowerCase().trim();
  const firstName = first_name.trim();
  const lastName = last_name.trim();

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length)
    return res.status(409).json({ error: 'This email already has an account.' });

  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: normalizedEmail,
      redirectUrl: inviteRedirectUrl(),
      publicMetadata: { role, firstName, lastName },
      ignoreExisting: true,
    });

    await db.query(
      `INSERT INTO invitations (clerk_invitation_id, email, role, first_name, last_name, invited_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (clerk_invitation_id) DO NOTHING`,
      [invitation.id, normalizedEmail, role, firstName, lastName, req.user.id]
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

// POST /api/invitations/:id/resend — revoke current Clerk invite and send a fresh one
router.post('/:id/resend', auth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM invitations WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Invitation not found.' });
    const old = rows[0];

    if (old.clerk_invitation_id && !old.revoked_at) {
      try { await clerkClient.invitations.revokeInvitation(old.clerk_invitation_id); } catch {}
    }

    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: old.email,
      redirectUrl: inviteRedirectUrl(),
      publicMetadata: { role: old.role, firstName: old.first_name, lastName: old.last_name },
      ignoreExisting: true,
    });

    await db.query(
      `UPDATE invitations
       SET clerk_invitation_id = $1, created_at = NOW(), revoked_at = NULL
       WHERE id = $2`,
      [invitation.id, old.id]
    );

    res.json({ success: true });
  } catch (err) {
    const detail = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err.message;
    res.status(500).json({ error: `Failed to resend invitation: ${detail}` });
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
