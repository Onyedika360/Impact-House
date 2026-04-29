const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { dispatchMessage }  = require('../services/sender');
const { sendTestEmail }    = require('../services/email');

router.use(auth);

// GET /api/messages
router.get('/', async (req, res) => {
  try {
    const { channel, status, page = 1, limit = 20 } = req.query;
    const params = [], conditions = [];
    if (channel) { params.push(channel); conditions.push(`m.channel = $${params.length}`); }
    if (status)  { params.push(status);  conditions.push(`m.status  = $${params.length}`); }
    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      `SELECT m.*, g.name AS group_name
       FROM messages m
       LEFT JOIN groups g ON m.group_id = g.id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const { rows: cr } = await db.query(`SELECT COUNT(*) FROM messages m ${where}`, params);
    res.json({ messages: rows, total: parseInt(cr[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// GET /api/messages/recipient-count?channel=email|sms&group_id=&recipient_type=all|group
// Must be defined before /:id to avoid Express treating "recipient-count" as an id.
router.get('/recipient-count', async (req, res) => {
  try {
    const { channel = 'email', recipient_type = 'all', group_id } = req.query;
    const notifyCol = channel === 'sms' ? 'notify_sms' : 'notify_email';

    let q = `SELECT COUNT(*) FROM members WHERE status = 'active' AND unsubscribed_at IS NULL AND ${notifyCol} = true`;
    const params = [];
    if (recipient_type === 'group' && group_id) {
      params.push(group_id);
      q += ` AND id IN (SELECT member_id FROM member_tags WHERE group_id = $1)`;
    }

    const { rows } = await db.query(q, params);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to count recipients.' });
  }
});

// GET /api/messages/:id
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.*, g.name AS group_name FROM messages m
     LEFT JOIN groups g ON m.group_id = g.id WHERE m.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Message not found.' });
  res.json(rows[0]);
});

// POST /api/messages — create (draft / scheduled / send-now)
router.post('/', async (req, res) => {
  const { title, body, subject, channel, recipient_type = 'all', group_id, scheduled_at, send_now = false } = req.body;
  if (!title || !body || !channel)
    return res.status(400).json({ error: 'title, body and channel are required.' });
  if (!['sms', 'email', 'both'].includes(channel))
    return res.status(400).json({ error: 'channel must be sms, email or both.' });
  if (channel !== 'sms' && !subject)
    return res.status(400).json({ error: 'subject is required for email.' });

  try {
    const status = send_now ? 'sending' : (scheduled_at ? 'scheduled' : 'draft');
    const { rows } = await db.query(
      `INSERT INTO messages (title, body, subject, channel, status, recipient_type, group_id, sent_by_clerk_id, sent_by_name, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, body, subject || null, channel, status, recipient_type, group_id || null,
       req.auth.userId, req.auth.name || 'Admin', scheduled_at || null]
    );
    const message = rows[0];

    if (send_now) {
      const totalSent = await dispatchMessage(db, message);
      message.status     = 'sent';
      message.total_sent = totalSent;
    }

    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create message.' });
  }
});

// POST /api/messages/test — send a test email to the requesting admin only; no DB record created
router.post('/test', async (req, res) => {
  const { channel, subject, body, to } = req.body;
  if (!body)     return res.status(400).json({ error: 'body is required.' });
  if (!to)       return res.status(400).json({ error: 'to (admin email) is required.' });
  if (channel === 'sms')
    return res.status(400).json({ error: 'SMS test send is pending Twilio verification.' });

  try {
    await sendTestEmail({ to, subject, body });
    res.json({ success: true });
  } catch (err) {
    const detail = err?.response?.body?.errors?.[0]?.message || err.message;
    console.error('Test send failed:', detail);
    res.status(500).json({ error: `Test send failed: ${detail}` });
  }
});

// POST /api/messages/:id/send — promote an existing draft to sent
router.post('/:id/send', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE messages SET status = 'sending' WHERE id = $1 AND status = 'draft' RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Draft not found.' });

    const message  = rows[0];
    const totalSent = await dispatchMessage(db, message);
    res.json({ ...message, status: 'sent', total_sent: totalSent });
  } catch (err) {
    console.error(err);
    await db.query(`UPDATE messages SET status = 'failed' WHERE id = $1`, [req.params.id]);
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// PATCH /api/messages/:id — edit a draft or scheduled message
router.patch('/:id', async (req, res) => {
  const { title, body, subject, scheduled_at } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE messages SET
         title = COALESCE($1, title), body = COALESCE($2, body),
         subject = COALESCE($3, subject), scheduled_at = COALESCE($4, scheduled_at)
       WHERE id = $5 AND status IN ('draft','scheduled') RETURNING *`,
      [title, body, subject, scheduled_at, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Draft not found or already sent.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update message.' });
  }
});

// DELETE /api/messages/:id — cancel draft or scheduled messages
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM messages WHERE id = $1 AND status IN ('draft', 'scheduled')`, [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Message not found or already sent.' });
  res.json({ success: true });
});

// GET /api/messages/:id/deliveries
router.get('/:id/deliveries', async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.*, CONCAT(m.first_name,' ',m.last_name) AS member_name, m.email, m.phone
     FROM message_deliveries d JOIN members m ON d.member_id = m.id
     WHERE d.message_id = $1 ORDER BY d.created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

module.exports = router;
