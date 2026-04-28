const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL,
  name:  process.env.SENDGRID_FROM_NAME,
};

// Sends emails to a list of members and updates delivery statuses in the DB.
// members must already have delivery rows in message_deliveries.
async function sendEmailBatch(db, message, members) {
  const results = await Promise.allSettled(
    members.map(member =>
      sgMail.send({
        to:      member.email,
        from:    FROM,
        subject: message.subject,
        text:    message.body,
        html:    message.body.replace(/\n/g, '<br>'),
      })
    )
  );

  let sent = 0, failed = 0;
  for (let i = 0; i < members.length; i++) {
    const success = results[i].status === 'fulfilled';
    const error   = success
      ? null
      : (results[i].reason?.response?.body?.errors?.[0]?.message
          || results[i].reason?.message
          || 'Unknown error');

    if (success) sent++;
    else { failed++; console.error(`Email failed for ${members[i].email}: ${error}`); }

    await db.query(
      `UPDATE message_deliveries
       SET status = $1, error = $2, delivered_at = $3
       WHERE message_id = $4 AND member_id = $5 AND channel = 'email'`,
      [success ? 'delivered' : 'failed', error, success ? new Date() : null, message.id, members[i].id]
    );
  }

  console.log(`Email: sent=${sent} failed=${failed} for message ${message.id}`);
  return { sent, failed };
}

module.exports = { sendEmailBatch };
