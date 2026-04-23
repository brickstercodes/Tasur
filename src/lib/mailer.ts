/**
 * WHY: Nodemailer transport for BetterAuth email flows (verification + OTP).
 *
 * Uses Gmail SMTP with an app password. The transporter is lazily created
 * so missing env vars only error when an email is actually sent — not at
 * module load time — which keeps `next build` and unrelated routes working.
 */

import nodemailer, { type Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      'GMAIL_USER and GMAIL_APP_PASSWORD must be set to send email.',
    );
  }

  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return cachedTransporter;
}

interface SendMailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail({ to, subject, html, text }: SendMailArgs): Promise<void> {
  const from = process.env.EMAIL_FROM ?? process.env.GMAIL_USER;
  await getTransporter().sendMail({ from, to, subject, html, text });
}

export function verificationEmail(url: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Verify your Tasur email',
    text: `Welcome to Tasur! Verify your email by visiting: ${url}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a;">
        <h2 style="margin:0 0 12px;">Verify your email</h2>
        <p>Welcome to Tasur. Click the button below to confirm your email address.</p>
        <p style="margin:24px 0;">
          <a href="${url}" style="background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Verify email</a>
        </p>
        <p style="color:#666;font-size:13px;">Or paste this link into your browser:<br/>${url}</p>
      </div>
    `,
  };
}

export function otpEmail(otp: string): { subject: string; html: string; text: string } {
  return {
    subject: `Your Tasur sign-in code: ${otp}`,
    text: `Your Tasur sign-in code is ${otp}. It expires in 5 minutes.`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a;">
        <h2 style="margin:0 0 12px;">Your sign-in code</h2>
        <p>Use the code below to sign in. It expires in 5 minutes.</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:24px 0;">${otp}</p>
        <p style="color:#666;font-size:13px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  };
}
