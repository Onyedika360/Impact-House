const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');

router.use(auth);

// GET /api/stats  — dashboard numbers
router.get('/', async (req, res) => {
  try {
    const [members, sms, emails, openRate, recentActivity] = await Promise.all([

      // Total active members
      db.query(`SELECT COUNT(*) FROM members WHERE status = 'active'`),

      // Total SMS sent
      db.query(`SELECT COALESCE(SUM(total_sent),0) AS count FROM messages WHERE channel IN ('sms','both') AND status = 'sent'`),

      // Total newsletters sent
      db.query(`SELECT COUNT(*) FROM messages WHERE channel IN ('email','both') AND status = 'sent'`),

      // Average open rate across email sends
      db.query(`
        SELECT CASE WHEN SUM(total_sent) > 0
               THEN ROUND(SUM(total_opened)::numeric / SUM(total_sent) * 100, 1)
               ELSE 0 END AS rate
        FROM messages WHERE channel IN ('email','both') AND status = 'sent'
      `),

      // Recent activity feed (last 10 events)
      db.query(`
        SELECT 'message' AS type, title, channel, status, total_sent, sent_at AS event_time
        FROM messages WHERE status = 'sent'
        UNION ALL
        SELECT 'member' AS type,
               CONCAT('New member: ', first_name, ' ', last_name) AS title,
               NULL, 'added', NULL, created_at
        FROM members
        ORDER BY event_time DESC NULLS LAST
        LIMIT 10
      `),
    ]);

    // New members this month
    const { rows: newThisMonth } = await db.query(`
      SELECT COUNT(*) FROM members
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `);

    res.json({
      total_members:    parseInt(members.rows[0].count),
      new_this_month:   parseInt(newThisMonth[0].count),
      total_sms_sent:   parseInt(sms.rows[0].count),
      total_emails_sent: parseInt(emails.rows[0].count),
      avg_open_rate:    parseFloat(openRate.rows[0].rate),
      recent_activity:  recentActivity.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

module.exports = router;
