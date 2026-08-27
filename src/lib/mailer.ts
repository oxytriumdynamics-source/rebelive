import nodemailer, { Transporter } from 'nodemailer';
import { google } from 'googleapis';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';

// ─── Gmail OAuth2 Transport ────────────────────────────

const oAuth2Client = new google.auth.OAuth2(
  env.MAIL_CLIENT_ID,
  env.MAIL_CLIENT_SECRET,
  env.MAIL_REDIRECT_URI,
);

oAuth2Client.setCredentials({ refresh_token: env.MAIL_REFRESH_TOKEN });

async function createTransport(): Promise<Transporter> {
  const { token } = await oAuth2Client.getAccessToken();

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: env.MAIL_FROM_EMAIL,
      clientId: env.MAIL_CLIENT_ID,
      clientSecret: env.MAIL_CLIENT_SECRET,
      refreshToken: env.MAIL_REFRESH_TOKEN,
      accessToken: token ?? '',
    },
  } as nodemailer.TransportOptions);
}

// ─── sendMail ──────────────────────────────────────────

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  try {
    const transport = await createTransport();
    await transport.sendMail({
      from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
    });
    logger.info(`[Mail] Sent "${opts.subject}" → ${opts.to}`);
  } catch (err) {
    logger.error(`[Mail] Failed to send "${opts.subject}" → ${opts.to}: ${err}`);
    // Don't throw — mail failures should not break the auth flow
  }
}
