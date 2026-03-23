const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');

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

// POST /api/messages
router.post('/', async (req, res) => {
  const { title, body, subject, channel, recipient_type = 'all', group_id, scheduled_at, send_now = false } = req.body;
  if (!title || !body || !channel)
    return res.status(400).json({ error: 'title, body and channel are required.' });
  if (!['sms','email','both'].includes(channel))
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
      let memberQuery = 'SELECT * FROM members WHERE status = $1';
      const qParams   = ['active'];
      if (recipient_type === 'group' && group_id) { memberQuery += ' AND id IN (SELECT member_id FROM member_tags WHERE group_id = $2)'; qParams.push(group_id); }

      const { rows: members } = await db.query(memberQuery, qParams);
      const channels = channel === 'both' ? ['sms','email'] : [channel];

      for (const ch of channels) {
        const eligible = members.filter(m => ch === 'sms' ? (m.notify_sms && m.phone) : (m.notify_email && m.email));
        if (eligible.length) {
          const vals   = eligible.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ');
          const params = [message.id];
          eligible.forEach(m => { params.push(m.id); params.push(ch); });
          await db.query(
            `INSERT INTO message_deliveries (message_id, member_id, channel) VALUES ${vals} ON CONFLICT DO NOTHING`,
            params
          );
        }
      }

      const { rows: dc } = await db.query(
        'SELECT COUNT(*) FROM message_deliveries WHERE message_id = $1', [message.id]
      );
      await db.query(
        `UPDATE messages SET status = 'sent', sent_at = NOW(), total_sent = $1 WHERE id = $2`,
        [parseInt(dc[0].count), message.id]
      );
      message.status     = 'sent';
      message.total_sent = parseInt(dc[0].count);

      // TODO: integrate Twilio (SMS) and SendGrid (Email) here
    }

    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create message.' });
  }
});

// PATCH /api/messages/:id
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
