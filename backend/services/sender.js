const { sendEmailBatch } = require('./email');

// Builds the recipient list, inserts delivery rows, fires email (and later SMS),
// then marks the message as 'sent'. Called by both routes/messages.js and scheduler.js.
async function dispatchMessage(db, message) {
  let memberQuery = `SELECT * FROM members WHERE status = 'active' AND unsubscribed_at IS NULL`;
  const qParams   = [];
  if (message.recipient_type === 'group' && message.group_id) {
    memberQuery += ` AND id IN (SELECT member_id FROM member_tags WHERE group_id = $1)`;
    qParams.push(message.group_id);
  }

  const { rows: members } = await db.query(memberQuery, qParams);
  const channels = message.channel === 'both' ? ['sms', 'email'] : [message.channel];

  for (const ch of channels) {
    const eligible = members.filter(m =>
      ch === 'sms' ? (m.notify_sms && m.phone) : (m.notify_email && m.email)
    );
    if (!eligible.length) continue;

    const vals   = eligible.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
    const params = [message.id];
    eligible.forEach(m => { params.push(m.id); params.push(ch); });
    await db.query(
      `INSERT INTO message_deliveries (message_id, member_id, channel) VALUES ${vals} ON CONFLICT DO NOTHING`,
      params
    );

    if (ch === 'email') await sendEmailBatch(db, message, eligible);
    // TODO: add Twilio SMS here when account is verified
  }

  const { rows: dc } = await db.query(
    'SELECT COUNT(*) FROM message_deliveries WHERE message_id = $1', [message.id]
  );
  const totalSent = parseInt(dc[0].count);
  await db.query(
    `UPDATE messages SET status = 'sent', sent_at = NOW(), total_sent = $1 WHERE id = $2`,
    [totalSent, message.id]
  );
  return totalSent;
}

module.exports = { dispatchMessage };
