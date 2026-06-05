import nodemailer from 'nodemailer';
import { config } from '../config';

function createTransport() {
  if (!config.smtp.host) return null;
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const transport = createTransport();

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#a855f7">Reset your SongScope password</h2>
      <p>Click the link below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
      <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#a855f7;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
        Reset Password
      </a>
      <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  if (!transport) {
    // No SMTP configured — log to console for development
    console.log('\n=== PASSWORD RESET ===');
    console.log(`To: ${email}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log('=====================\n');
    return;
  }

  await transport.sendMail({
    from: config.smtp.from,
    to: email,
    subject: 'Reset your SongScope password',
    html,
  });
}
