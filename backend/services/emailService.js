const nodemailer = require("nodemailer");

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM;

  if (!host || !user || !pass || !from) {
    return { transport: null, from: null };
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return { transport, from };
}

async function sendMail({ to, subject, text }) {
  const { transport, from } = getTransport();
  if (!transport || !from) {
    console.log(`[email][dry-run] Would send mail to ${to}: ${subject}`);
    return false;
  }
  await transport.sendMail({ from, to, subject, text });
  return true;
}

module.exports = { sendMail };
