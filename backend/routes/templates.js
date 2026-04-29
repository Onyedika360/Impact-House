const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');

router.use(auth);

// GET /api/templates?channel=email|sms|both
router.get('/', async (req, res) => {
  try {
    const { channel } = req.query;
    const params = [], conditions = [];
    if (channel) { params.push(channel); conditions.push(`channel = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT * FROM message_templates ${where} ORDER BY updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch templates.' });
  }
});

// GET /api/templates/:id
router.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM message_templates WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Template not found.' });
  res.json(rows[0]);
});

// POST /api/templates
router.post('/', async (req, res) => {
  const { name, channel, subject, body } = req.body;
  if (!name || !channel || !body)
    return res.status(400).json({ error: 'name, channel, and body are required.' });
  if (!['sms', 'email', 'both'].includes(channel))
    return res.status(400).json({ error: 'channel must be sms, email, or both.' });
  try {
    const { rows } = await db.query(
      `INSERT INTO message_templates (name, channel, subject, body, created_by_clerk_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, channel, subject || null, body, req.auth.userId, req.auth.name || 'Admin']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create template.' });
  }
});

// PATCH /api/templates/:id
router.patch('/:id', async (req, res) => {
  const { name, subject, body } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE message_templates
       SET name = COALESCE($1, name), subject = COALESCE($2, subject),
           body = COALESCE($3, body), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name, subject, body, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Template not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update template.' });
  }
});

// DELETE /api/templates/:id
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM message_templates WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Template not found.' });
  res.json({ success: true });
});

module.exports = router;
