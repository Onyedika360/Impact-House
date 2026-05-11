const router     = require('express').Router();
const { randomUUID } = require('crypto');
const { verifyToken } = require('@clerk/backend');
const db         = require('../db');
const auth       = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const sgMail     = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Verifies the Clerk JWT but does NOT require a row in the users table.
// Used only for /accept where the user doesn't exist in our DB yet.
async function jwtOnly(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ error: 'No token provided.' });
    const payload = await verifyToken(authHeader.split(' ')[1], {
      secretKey: process.env.CLERK_SECRET_KEY,
      clockSkewInMs: 60000,
    });
    req.auth = { userId: payload.sub };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

// POST /api/invitations — admin sends an invite email
router.post('/', auth, requireRole('admin'), async (req, res) => {
  const { email, role = 'editor' } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'email is required.' });
  if (!['admin', 'editor'].includes(role))
    return res.status(400).json({ error: 'role must be admin or editor.' });

  // Don't invite someone already on the team
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing.rows.length)
    return res.status(409).json({ error: 'This email already has an account.' });

  // Invalidate any prior pending invite for this email
  await db.query(
    `UPDATE invitations SET expires_at = NOW() WHERE email = $1 AND accepted_at IS NULL`,
    [email.toLowerCase().trim()]
  );

  const token     = randomUUID();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

  const { rows } = await db.query(
    `INSERT INTO invitations (email, role, token, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [email.toLowerCase().trim(), role, token, req.user.id, expiresAt]
  );

  const inviteUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`;

  try {
    await sgMail.send({
      to:      email,
      from:    { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME },
      subject: `You've been invited to Impact House`,
      text:    `${req.user.name || 'An admin'} has invited you to join the Impact House communications team as ${role}.\n\nAccept your invitation here:\n${inviteUrl}\n\nThis link expires in 72 hours.`,
      html:    `<p><strong>${req.user.name || 'An admin'}</strong> has invited you to join the Impact House communications team as <strong>${role}</strong>.</p>
                <p><a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#c9a96e;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Accept Invitation</a></p>
                <p style="font-size:12px;color:#888;">This link expires in 72 hours.</p>`,
    });
  } catch (err) {
    // Roll back the invitation row if email failed
    await db.query('DELETE FROM invitations WHERE id = $1', [rows[0].id]);
    const detail = err?.response?.body?.errors?.[0]?.message || err.message;
    return res.status(500).json({ error: `Failed to send invite email: ${detail}` });
  }

  res.status(201).json({ success: true, email, role, expires_at: expiresAt });
});

// GET /api/invitations — list pending invitations (admin only)
router.get('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT i.*, u.name AS invited_by_name
       FROM invitations i
       LEFT JOIN users u ON i.invited_by = u.id
       WHERE i.accepted_at IS NULL AND i.expires_at > NOW()
       ORDER BY i.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch invitations.' });
  }
});

// DELETE /api/invitations/:id — revoke a pending invite (admin only)
router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM invitations WHERE id = $1 AND accepted_at IS NULL`,
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Invitation not found or already accepted.' });
  res.json({ success: true });
});

// POST /api/invitations/accept — called after Clerk sign-in, creates the user record
router.post('/accept', jwtOnly, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required.' });

  try {
    const { rows } = await db.query(
      `SELECT * FROM invitations
       WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
      [token]
    );
    if (!rows.length)
      return res.status(400).json({ error: 'Invalid or expired invitation token.' });

    const inv = rows[0];

    // Check if the signed-in Clerk user already has an account
    const existing = await db.query('SELECT id FROM users WHERE clerk_id = $1', [req.auth.userId]);
    if (existing.rows.length)
      return res.status(409).json({ error: 'You already have an account. Please sign in normally.' });

    // Create the user record
    await db.query(
      `INSERT INTO users (clerk_id, email, name, role) VALUES ($1, $2, $3, $4)`,
      [req.auth.userId, inv.email, req.body.name || inv.email.split('@')[0], inv.role]
    );

    // Mark invitation accepted
    await db.query(
      `UPDATE invitations SET accepted_at = NOW() WHERE id = $1`,
      [inv.id]
    );

    res.json({ success: true, role: inv.role });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to accept invitation.' });
  }
});

module.exports = router;
