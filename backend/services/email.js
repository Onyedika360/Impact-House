const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL,
  name:  process.env.SENDGRID_FROM_NAME,
};

const TOKEN_FIRST = /\{\{\s*first_name\s*\}\}/g;
const TOKEN_LAST  = /\{\{\s*last_name\s*\}\}/g;
const HAS_HTML    = /<[a-z][\s\S]*>/i;

const footerText = (token) =>
  `\n\n—\nDon't want these emails? Unsubscribe: ${process.env.PUBLIC_URL}/api/public/unsubscribe?token=${token}`;

const footerHtml = (token) =>
  `<hr style="margin:24px 0;border:none;border-top:1px solid #e0e0e0"><p style="font-size:12px;color:#888;margin:0">Don't want these emails? <a href="${process.env.PUBLIC_URL}/api/public/unsubscribe?token=${token}" style="color:#888">Unsubscribe</a>.</p>`;

function applyTokens(str, member) {
  return str
    .replace(TOKEN_FIRST, member.first_name || '')
    .replace(TOKEN_LAST,  member.last_name  || '');
}

function buildHtml(body) {
  return HAS_HTML.test(body) ? body : body.replace(/\n/g, '<br>');
}

// Sends emails to a list of members and updates delivery statuses in the DB.
// members must already have delivery rows in message_deliveries.
async function sendEmailBatch(db, message, members) {
  const results = await Promise.allSettled(
    members.map(member => {
      const subject = applyTokens(message.subject || '', member);
      const body    = applyTokens(message.body,         member);
      return sgMail.send({
        to:      member.email,
        from:    FROM,
        subject,
        text:    body + footerText(member.unsubscribe_token || ''),
        html:    buildHtml(body) + footerHtml(member.unsubscribe_token || ''),
      });
    })
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

// Sends a one-off test email to a single address (no DB row needed).
async function sendTestEmail({ to, subject, body }) {
  const htmlBody = buildHtml(body);
  await sgMail.send({
    to,
    from:    FROM,
    subject: `[TEST] ${subject || '(no subject)'}`,
    text:    body + '\n\n— This is a test send.',
    html:    htmlBody + '<hr style="margin:24px 0;border:none;border-top:1px solid #e0e0e0"><p style="font-size:12px;color:#888;margin:0">This is a test send.</p>',
  });
}

module.exports = { sendEmailBatch, sendTestEmail };
