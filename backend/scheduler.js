const db = require('./db');

// Runs every 60 seconds — finds scheduled messages due to send and processes them
function startScheduler() {
  setInterval(async () => {
    try {
      // Find scheduled messages whose time has come
      const { rows: due } = await db.query(`
        SELECT * FROM messages
        WHERE status = 'scheduled' AND scheduled_at <= NOW()
      `);

      for (const message of due) {
        try {
          // Mark as sending
          await db.query(`UPDATE messages SET status = 'sending' WHERE id = $1`, [message.id]);

          // Build recipient list
          let memberQuery = `SELECT * FROM members WHERE status = 'active'`;
          const qParams   = [];
          if (message.recipient_type === 'group' && message.group_id) {
            memberQuery += ` AND group_id = $1`;
            qParams.push(message.group_id);
          }
          const { rows: members } = await db.query(memberQuery, qParams);
          const channels = message.channel === 'both' ? ['sms', 'email'] : [message.channel];

          for (const ch of channels) {
            const eligible = members.filter(m => ch === 'sms' ? (m.notify_sms && m.phone) : (m.notify_email && m.email));
            if (eligible.length) {
              const vals   = eligible.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
              const params = [message.id];
              eligible.forEach(m => { params.push(m.id); params.push(ch); });
              await db.query(
                `INSERT INTO message_deliveries (message_id, member_id, channel) VALUES ${vals} ON CONFLICT DO NOTHING`,
                params
              );
            }
          }

          // TODO: Trigger Twilio/SendGrid here when ready

          const { rows: dc } = await db.query(
            `SELECT COUNT(*) FROM message_deliveries WHERE message_id = $1`, [message.id]
          );
          await db.query(
            `UPDATE messages SET status = 'sent', sent_at = NOW(), total_sent = $1 WHERE id = $2`,
            [parseInt(dc[0].count), message.id]
          );

          console.log(`Scheduler: sent message ${message.id} to ${dc[0].count} recipients`);
        } catch (err) {
          console.error(`Scheduler: failed to send message ${message.id}:`, err.message);
          await db.query(`UPDATE messages SET status = 'failed' WHERE id = $1`, [message.id]);
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  }, 60 * 1000); // every 60 seconds

  console.log('Scheduler started — checking for due messages every 60s');
}

module.exports = { startScheduler };
