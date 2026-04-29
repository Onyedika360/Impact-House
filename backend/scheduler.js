const db = require('./db');
const { dispatchMessage } = require('./services/sender');

// Runs every 60 seconds — finds scheduled messages due to send and processes them
function startScheduler() {
  setInterval(async () => {
    try {
      const { rows: due } = await db.query(`
        SELECT * FROM messages
        WHERE status = 'scheduled' AND scheduled_at <= NOW()
      `);

      for (const message of due) {
        try {
          await db.query(`UPDATE messages SET status = 'sending' WHERE id = $1`, [message.id]);
          const totalSent = await dispatchMessage(db, message);
          console.log(`Scheduler: sent message ${message.id} to ${totalSent} recipients`);
        } catch (err) {
          console.error(`Scheduler: failed to send message ${message.id}:`, err.message);
          await db.query(`UPDATE messages SET status = 'failed' WHERE id = $1`, [message.id]);
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  }, 60 * 1000);

  console.log('Scheduler started — checking for due messages every 60s');
}

module.exports = { startScheduler };
