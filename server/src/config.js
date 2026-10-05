// Reads environment variables once, validates them, and exports a typed config.
// If something required is missing, the server refuses to start with a clear message
// instead of failing later in a confusing way.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  TIMEZONE: z.string().default('Africa/Nairobi'),

  AI_PROVIDER: z.enum(['rules', 'gemini', 'ollama']).default('rules'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta'),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.2:3b'),

  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  SMS_PROVIDER: z.enum(['mock']).default('mock'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

export const config = parsed.data;
