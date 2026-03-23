const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');

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
      conditions.push(`m.id IN (SELECT member_id FROM member_tags WHERE group_id = $${params.length})`);
    }
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      conditions.push(`(m.first_name ILIKE $${i} OR m.last_name ILIKE $${i} OR m.email ILIKE $${i} OR m.phone ILIKE $${i})`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await db.query(
      `SELECT m.*,
              CONCAT(m.first_name, ' ', m.last_name) AS full_name,
              COALESCE(
                json_agg(json_build_object('id', g.id, 'name', g.name, 'type', g.type))
                FILTER (WHERE g.id IS NOT NULL),
                '[]'::json
              ) AS tags
       FROM members m
       LEFT JOIN member_tags mt ON m.id = mt.member_id
       LEFT JOIN groups g ON mt.group_id = g.id
       ${where}
       GROUP BY m.id
       ORDER BY m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await db.query(
      `SELECT COUNT(DISTINCT m.id) FROM members m ${where}`,
      params
    );

    res.json({ members: rows, total: parseInt(countRows[0].count), page: +page, limit: +limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch members.' });
  }
});

// GET /api/members/groups/list — all groups ordered primary first
router.get('/groups/list', async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM groups ORDER BY type = 'custom', name`);
  res.json(rows);
});

// POST /api/members/groups — create a custom tag
router.post('/groups', async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Tag name is required.' });
  try {
    const { rows } = await db.query(
      `INSERT INTO groups (name, type) VALUES ($1, 'custom') RETURNING *`,
      [name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A tag with this name already exists.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create tag.' });
  }
});

// DELETE /api/members/groups/:id — delete a custom tag only
router.delete('/groups/:id', async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM groups WHERE id = $1 AND type = 'custom'`,
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Tag not found or cannot delete a primary tag.' });
  res.json({ success: true });
});

// GET /api/members/:id
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.*,
            COALESCE(
              json_agg(json_build_object('id', g.id, 'name', g.name, 'type', g.type))
              FILTER (WHERE g.id IS NOT NULL),
              '[]'::json
            ) AS tags
     FROM members m
     LEFT JOIN member_tags mt ON m.id = mt.member_id
     LEFT JOIN groups g ON mt.group_id = g.id
     WHERE m.id = $1
     GROUP BY m.id`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Member not found.' });
  res.json(rows[0]);
});

// POST /api/members
router.post('/', async (req, res) => {
  const { first_name, last_name, email, phone, group_ids = [], notify_sms = true, notify_email = true, notes } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name are required.' });

  try {
    const { rows } = await db.query(
      `INSERT INTO members (first_name, last_name, email, phone, notify_sms, notify_email, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [first_name, last_name, email || null, phone || null, notify_sms, notify_email, notes || null]
    );
    const member = rows[0];

    if (group_ids.length) {
      const vals   = group_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      const params = [member.id, ...group_ids];
      await db.query(
        `INSERT INTO member_tags (member_id, group_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
        params
      );
    }

    member.tags = group_ids.length ? [] : []; // will be populated on next fetch
    res.status(201).json(member);
  } catch (err) {
    if (err.code === '23505') {
      const field = err.constraint?.includes('email') ? 'email address' : 'phone number';
      return res.status(409).json({ error: `A member with this ${field} already exists.` });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create member.' });
  }
});

// PATCH /api/members/:id
router.patch('/:id', async (req, res) => {
  const { group_ids, ...rest } = req.body;
  const allowed = ['first_name','last_name','email','phone','notify_sms','notify_email','status','notes'];
  const updates = [];
  const values  = [];

  Object.entries(rest).forEach(([key, val]) => {
    if (allowed.includes(key)) {
      values.push(val);
      updates.push(`${key} = $${values.length}`);
    }
  });

  try {
    let member;
    if (updates.length) {
      values.push(new Date()); updates.push(`updated_at = $${values.length}`);
      values.push(req.params.id);
      const { rows } = await db.query(
        `UPDATE members SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows.length) return res.status(404).json({ error: 'Member not found.' });
      member = rows[0];
    } else {
      const { rows } = await db.query('SELECT * FROM members WHERE id = $1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Member not found.' });
      member = rows[0];
    }

    // Replace tags if group_ids provided
    if (Array.isArray(group_ids)) {
      await db.query('DELETE FROM member_tags WHERE member_id = $1', [req.params.id]);
      if (group_ids.length) {
        const vals   = group_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
        const params = [req.params.id, ...group_ids];
        await db.query(
          `INSERT INTO member_tags (member_id, group_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
          params
        );
      }
    }

    res.json(member);
  } catch (err) {
    if (err.code === '23505') {
      const field = err.constraint?.includes('email') ? 'email address' : 'phone number';
      return res.status(409).json({ error: `A member with this ${field} already exists.` });
    }
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
