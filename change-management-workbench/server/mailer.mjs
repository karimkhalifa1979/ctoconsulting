// Email delivery for notifications (WFL-003) and scheduled distribution (ART-015, RPT-006).
// Configure SMTP_URL (for example smtps://user:pass@smtp.example.org) and MAIL_FROM.
export async function createMailer(env, log) {
  if (!env.SMTP_URL) {
    return { enabled: false, async send(to, subject) { if (env.LOG_EMAIL === '1') log('info', 'Email (not sent: SMTP is not configured)', { to, subject }); } };
  }
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport(env.SMTP_URL);
  return {
    enabled: true,
    async send(to, subject, text, attachments = []) {
      try {
        await transport.sendMail({ from: env.MAIL_FROM || 'change-workbench@localhost', to, subject, text, attachments });
      } catch (e) {
        log('warn', 'Email delivery failed', { to, subject, error: e.message });
      }
    },
  };
}
