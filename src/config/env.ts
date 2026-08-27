import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_CALLBACK_URL: z.string().url('GOOGLE_CALLBACK_URL must be a valid URL'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  CLIENT_URL: z.string().default('http://localhost:3000'),

  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX: z.string().default('100'),

  // Nodemailer / Gmail OAuth2
  MAIL_CLIENT_ID: z.string().min(1, 'MAIL_CLIENT_ID is required'),
  MAIL_CLIENT_SECRET: z.string().min(1, 'MAIL_CLIENT_SECRET is required'),
  MAIL_REFRESH_TOKEN: z.string().min(1, 'MAIL_REFRESH_TOKEN is required'),
  MAIL_REDIRECT_URI: z.string().default('https://developers.google.com/oauthplayground'),
  MAIL_FROM_EMAIL: z.string().email().default('noreply@rebelive.co'),
  MAIL_FROM_NAME: z.string().default('REBELIVE'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((e) => {
    console.error(`  ${e.path.join('.')}: ${e.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;

export type Env = typeof env;
