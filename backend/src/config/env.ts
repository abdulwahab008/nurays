/**
 * Startup configuration check.
 *
 * Production must never quietly run on development fallbacks (a test mailbox,
 * OTP codes printed to the logs, a sample JWT secret, the payment sandbox). The
 * server checks its configuration once at boot and refuses to start, listing
 * every problem, when something required is missing or unsafe.
 *
 * NODE_ENV: only "development" and "test" relax anything. Any other value,
 * including a typo or none at all in a container, is treated as production.
 */

export type RuntimeMode = 'development' | 'test' | 'production';

export function runtimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  const v = (env.NODE_ENV || '').trim().toLowerCase();
  if (v === 'development' || v === 'test') return v;
  return 'production';
}

export const isProduction = (env: NodeJS.ProcessEnv = process.env) => runtimeMode(env) === 'production';

// Values copied from the example file or docs; never acceptable as a real secret.
const PLACEHOLDER_SECRETS = [
  'your-super-secret-key-change-in-production',
  'your-secret-key',
  'change-me',
  'changeme',
  'secret',
];
const looksLikePlaceholder = (v: string) => {
  const s = v.trim().toLowerCase();
  return PLACEHOLDER_SECRETS.includes(s) || s.includes('change-in-production') || s.startsWith('your-') || /^(.)\1+$/.test(s);
};

export type SmsProvider = 'twilio' | 'console' | 'none';
export type EmailProvider = 'gmail' | 'smtp' | 'ethereal' | 'console';

export function smsProvider(env: NodeJS.ProcessEnv = process.env): SmsProvider {
  const explicit = (env.SMS_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'twilio' || explicit === 'console' || explicit === 'none') return explicit;
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER) return 'twilio';
  return runtimeMode(env) === 'production' ? 'none' : 'console';
}

export function emailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  if ((env.EMAIL_SERVICE || '').toLowerCase() === 'gmail') return 'gmail';
  if (env.SMTP_HOST) return 'smtp';
  if (runtimeMode(env) === 'development') return 'ethereal';
  return 'console';
}

/** Every configuration problem, as human-readable lines (empty = fine). */
export function configProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const prod = runtimeMode(env) === 'production';
  const need = (name: string, why: string) => {
    if (!env[name] || !String(env[name]).trim()) problems.push(`${name} is required (${why}).`);
  };

  need('DATABASE_URL', 'PostgreSQL connection');
  const jwt = env.JWT_SECRET || '';
  if (!jwt) problems.push('JWT_SECRET is required.');
  else if (jwt.length < 32) problems.push('JWT_SECRET must be at least 32 characters.');
  else if (prod && looksLikePlaceholder(jwt)) problems.push('JWT_SECRET is a placeholder value; generate a real one (e.g. `openssl rand -hex 32`).');

  if (!!(env.VAPID_PUBLIC_KEY || '').trim() !== !!(env.VAPID_PRIVATE_KEY || '').trim()) {
    problems.push('Web push needs both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (generate them with `npx web-push generate-vapid-keys`), or neither.');
  }

  const cashLimit = (env.RIDER_CASH_LIMIT || '').trim();
  if (cashLimit && !(Number(cashLimit) > 0)) problems.push(`RIDER_CASH_LIMIT must be an amount in rupees above 0 (got "${cashLimit}").`);

  if (prod) {
    need('REDIS_URL', 'rate limits, realtime updates and background jobs');
    need('FRONTEND_URL', 'used in email links for verification and password reset');
    if (env.FRONTEND_URL && !/^https:\/\//.test(env.FRONTEND_URL)) {
      problems.push('FRONTEND_URL must be an https:// URL in production.');
    }
    // Without it the API and the realtime server only accept http://localhost:3000: the real site cannot sign in.
    need('CORS_ORIGIN', 'the browser origin allowed to call the API, normally the same as FRONTEND_URL');
    if (env.CORS_ORIGIN && !/^https:\/\//.test(env.CORS_ORIGIN.trim())) {
      problems.push('CORS_ORIGIN must be an https:// origin in production.');
    }

    const email = emailProvider(env);
    if (email !== 'gmail' && email !== 'smtp') {
      problems.push('Email is not configured: set SMTP_HOST / SMTP_USER / SMTP_PASSWORD (or EMAIL_SERVICE=gmail with EMAIL_USER / EMAIL_PASSWORD). Without it verification and password-reset emails are never sent.');
    }
    if (email === 'gmail' && (!env.EMAIL_USER || !env.EMAIL_PASSWORD)) problems.push('EMAIL_SERVICE=gmail needs EMAIL_USER and EMAIL_PASSWORD.');
    if (email === 'smtp' && (!env.SMTP_USER || !env.SMTP_PASSWORD)) problems.push('SMTP_HOST is set but SMTP_USER / SMTP_PASSWORD are missing.');
    need('EMAIL_FROM', 'the sender address on emails, for example Nuray <noreply@yourdomain.pk>');

    const sms = (env.SMS_PROVIDER || '').trim().toLowerCase();
    if (sms === 'console') problems.push('SMS_PROVIDER=console prints OTP codes to the logs; it is not allowed in production.');
    if (smsProvider(env) === 'none' && sms !== 'none') {
      problems.push('SMS is not configured: set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER, or set SMS_PROVIDER=none to run without phone OTP (phone sign-in and verification will be unavailable).');
    }

    if (env.SAFEPAY_SECRET_KEY && env.SAFEPAY_PUBLIC_KEY && !/^https:\/\//.test((env.BASE_URL || '').trim())) {
      problems.push('BASE_URL must be this API\'s public https:// URL when Safepay is configured: customers are sent back to it after paying.');
    }
    if (env.SAFEPAY_SECRET_KEY && env.SAFEPAY_PUBLIC_KEY && !(env.SAFEPAY_WEBHOOK_SECRET || '').trim()) {
      problems.push('SAFEPAY_WEBHOOK_SECRET is required when Safepay is configured (Safepay dashboard > Developer > Endpoints): without the webhook, a payment whose customer closes the page before returning is never recorded.');
    }
    if (env.SAFEPAY_SECRET_KEY && env.SAFEPAY_PUBLIC_KEY && !['true', 'false'].includes((env.SAFEPAY_SANDBOX || '').trim())) {
      problems.push('SAFEPAY_SANDBOX must be set explicitly to "false" (live payments) or "true" (sandbox) when Safepay keys are configured.');
    }

    const driver = (env.STORAGE_DRIVER || 'local').toLowerCase();
    if (driver === 's3') {
      for (const name of ['S3_BUCKET', 'ASSET_BASE_URL', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) need(name, 'STORAGE_DRIVER=s3');
    } else if (driver !== 'local') {
      problems.push(`STORAGE_DRIVER must be "local" or "s3" (got "${env.STORAGE_DRIVER}").`);
    } else if (!env.UPLOADS_DIR) {
      problems.push('STORAGE_DRIVER=local needs UPLOADS_DIR pointing at a persistent, backed-up volume (or use STORAGE_DRIVER=s3).');
    }
  }
  return problems;
}

/** Warnings worth printing at startup but not fatal. */
export function configWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  const mode = runtimeMode(env);
  if (!env.NODE_ENV) warnings.push('NODE_ENV is not set: running with production rules.');
  else if (!['development', 'test', 'production'].includes(env.NODE_ENV.trim().toLowerCase())) {
    warnings.push(`NODE_ENV="${env.NODE_ENV}" is not recognised: running with production rules.`);
  }
  if (mode !== 'production' && smsProvider(env) === 'console') warnings.push('SMS codes are printed to this console (development only).');
  if (mode === 'production' && !(env.VAPID_PUBLIC_KEY || '').trim()) {
    warnings.push('Push notifications are off (no VAPID keys). Kitchens and customers only get in-app, email and SMS alerts.');
  }
  if (mode === 'production' && (env.STORAGE_DRIVER || 'local').toLowerCase() === 'local') {
    warnings.push('Uploads are stored on this server\'s disk (UPLOADS_DIR). Make sure it is a persistent, backed-up volume; S3-compatible storage is recommended.');
  }
  return warnings;
}

/** Called first thing at startup: logs warnings, exits on problems. */
export function validateConfigOrExit(env: NodeJS.ProcessEnv = process.env): void {
  for (const w of configWarnings(env)) console.warn(`⚠️  ${w}`);
  const problems = configProblems(env);
  if (problems.length > 0) {
    console.error(`\n❌ Refusing to start: configuration problems (${runtimeMode(env)} mode):`);
    for (const p of problems) console.error(`   - ${p}`);
    console.error('\nSee backend/.env.example for every setting.\n');
    process.exit(1);
  }
}
