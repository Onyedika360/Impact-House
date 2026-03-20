const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');

// All routes require login
router.use(auth);

// GET /api/members  — list with optional search & filters
router.get('/', async (req, res) => {
  try {
    const { search, group_id, status = 'active', page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    if (status !== 'all') {
      params.push(status);
      conditions.push(`m.status = $${params.length}`);
    }
    if (group_id) {
      params.push(group_id);
      conditions.push(`m.group_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      conditions.push(`(m.first_name ILIKE $${i} OR m.last_name ILIKE $${i} OR m.email ILIKE $${i} OR m.phone ILIKE $${i})`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await db.query(
      `SELECT m.*, g.name AS group_name,
              CONCAT(m.first_name, ' ', m.last_name) AS full_name
       FROM members m
       LEFT JOIN groups g ON m.group_id = g.id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM members m ${where}`,
      params
    );

    res.json({ members: rows, total: parseInt(countRows[0].count), page: +page, limit: +limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch members.' });
  }
});

// GET /api/members/groups/list — must be before /:id to avoid conflict
router.get('/groups/list', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM groups ORDER BY name');
  res.json(rows);
});

// GET /api/members/:id
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.*, g.name AS group_name FROM members m
     LEFT JOIN groups g ON m.group_id = g.id WHERE m.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Member not found.' });
  res.json(rows[0]);
});

// POST /api/members
router.post('/', async (req, res) => {
  const { first_name, last_name, email, phone, group_id, notify_sms = true, notify_email = true, notes } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name are required.' });

  try {
    const { rows } = await db.query(
      `INSERT INTO members (first_name, last_name, email, phone, group_id, notify_sms, notify_email, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [first_name, last_name, email || null, phone || null, group_id || null, notify_sms, notify_email, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create member.' });
  }
});

// PATCH /api/members/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['first_name','last_name','email','phone','group_id','notify_sms','notify_email','status','notes'];
  const updates = [];
  const values  = [];

  Object.entries(req.body).forEach(([key, val]) => {
    if (allowed.includes(key)) {
      values.push(val);
      updates.push(`${key} = $${values.length}`);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update.' });

  values.push(new Date()); updates.push(`updated_at = $${values.length}`);
  values.push(req.params.id);

  try {
    const { rows } = await db.query(
      `UPDATE members SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Member not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update member.' });
  }
});

// DELETE /api/members/:id
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM members WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Member not found.' });
  res.json({ success: true });
});


module.exports = router;
