const router     = require('express').Router();
const rateLimit  = require('express-rate-limit');
const db         = require('../db');
const { normalizePhone } = require('../services/phone');
const { randomUUID }     = require('crypto');

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-up attempts. Please try again later.' },
});

// POST /api/public/signup
router.post('/signup', signupLimiter, async (req, res) => {
  const {
    first_name, last_name, email, phone,
    gender,
    notify_sms   = true,
    notify_email = true,
  } = req.body;

  if (!first_name?.trim() || !last_name?.trim())
    return res.status(400).json({ error: 'First and last name are required.' });
  if (!email?.trim() && !phone?.trim())
    return res.status(400).json({ error: 'Please provide at least an email or phone number.' });

  const normalizedPhone = normalizePhone(phone);
  const token = randomUUID();

  try {
    const { rows } = await db.query(
      `INSERT INTO members
         (first_name, last_name, email, phone, gender, notify_sms, notify_email, status, unsubscribe_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8)
       RETURNING id`,
      [
        first_name.trim(), last_name.trim(),
        email?.trim() || null,
        normalizedPhone,
        gender?.trim() || null,
        notify_sms,
        notify_email,
        token,
      ]
    );

    // Auto-tag with General Members primary group
    const { rows: gm } = await db.query(
      `SELECT id FROM groups WHERE name = 'General Members' AND type = 'primary' LIMIT 1`
    );
    if (gm.length) {
      await db.query(
        `INSERT INTO member_tags (member_id, group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [rows[0].id, gm[0].id]
      );
    }

    res.status(201).json({ success: true });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: "Looks like you're already on our list! Contact us if you need help." });
    console.error('Public signup error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/public/unsubscribe?token=…
router.get('/unsubscribe', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send(unsubscribePage('Invalid Link', 'No unsubscribe token was provided.', false));

  try {
    const { rows } = await db.query(
      `SELECT id, unsubscribed_at FROM members WHERE unsubscribe_token = $1`,
      [token]
    );
    if (!rows.length)
      return res.status(404).send(unsubscribePage('Invalid Link', 'This unsubscribe link is not recognised.', false));

    if (rows[0].unsubscribed_at) {
      return res.send(unsubscribePage(
        'Already Unsubscribed',
        "You're already unsubscribed and won't receive further messages from us.",
        true
      ));
    }

    await db.query(
      `UPDATE members SET notify_email = false, notify_sms = false, unsubscribed_at = NOW()
       WHERE id = $1`,
      [rows[0].id]
    );

    res.send(unsubscribePage(
      'Unsubscribed',
      "You've been unsubscribed and won't receive further messages from Impact House. We're sorry to see you go.",
      true
    ));
  } catch (err) {
    console.error('Unsubscribe error:', err.message);
    res.status(500).send(unsubscribePage('Error', 'Something went wrong. Please try again.', false));
  }
});

// GET /api/public/validate-invite?token=… — lets accept-invite.html check a token before Clerk sign-in
router.get('/validate-invite', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token is required.' });

  try {
    const { rows } = await db.query(
      `SELECT email, role FROM invitations
       WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
      [token]
    );
    if (!rows.length)
      return res.status(400).json({ error: 'Invalid or expired invitation.' });

    res.json({ valid: true, email: rows[0].email, role: rows[0].role });
  } catch (err) {
    console.error('Validate invite error:', err.message);
    res.status(500).json({ error: 'Failed to validate invitation.' });
  }
});

function unsubscribePage(title, message, success) {
  const color = success ? '#5a7a5a' : '#8b4444';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Impact House</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf9f7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:12px;padding:40px 32px;max-width:400px;width:100%;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .icon{font-size:40px;margin-bottom:16px}
    h1{font-size:20px;font-weight:600;color:#2c2620;margin-bottom:12px}
    p{font-size:14px;color:#6b6660;line-height:1.6}
    .status{display:inline-block;margin-top:20px;padding:6px 18px;border-radius:20px;font-size:13px;font-weight:500;color:#fff;background:${color}}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✅' : '⚠️'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="status">Impact House</div>
  </div>
</body>
</html>`;
}

module.exports = router;
