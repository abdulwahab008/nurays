import { configProblems, runtimeMode, smsProvider, emailProvider } from '../src/config/env';

const goodProd = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/nuray',
  REDIS_URL: 'redis://redis:6379',
  JWT_SECRET: 'f3a9c2e1b7d4a6f8c0e2b4d6a8f0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6',
  FRONTEND_URL: 'https://nuray.pk',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'u',
  SMTP_PASSWORD: 'p',
  EMAIL_FROM: 'Nuray <noreply@nuray.pk>',
  TWILIO_ACCOUNT_SID: 'AC1',
  TWILIO_AUTH_TOKEN: 't',
  TWILIO_PHONE_NUMBER: '+15550000000',
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'b',
  ASSET_BASE_URL: 'https://cdn.nuray.pk',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
} as NodeJS.ProcessEnv;

describe('startup configuration', () => {
  it('accepts a complete production configuration', () => {
    expect(configProblems(goodProd)).toEqual([]);
  });

  it('treats an unknown or missing NODE_ENV as production', () => {
    expect(runtimeMode({ NODE_ENV: 'prod' } as any)).toBe('production');
    expect(runtimeMode({} as any)).toBe('production');
    expect(runtimeMode({ NODE_ENV: 'development' } as any)).toBe('development');
  });

  it('refuses the sample JWT secret in production', () => {
    const p = configProblems({ ...goodProd, JWT_SECRET: 'your-super-secret-key-change-in-production' });
    expect(p.join(' ')).toMatch(/placeholder/);
  });

  it('refuses production without email, SMS, Redis or https links', () => {
    const p = configProblems({ ...goodProd, SMTP_HOST: '', TWILIO_ACCOUNT_SID: '', REDIS_URL: '', FRONTEND_URL: 'http://nuray.pk' }).join('\n');
    expect(p).toMatch(/Email is not configured/);
    expect(p).toMatch(/SMS is not configured/);
    expect(p).toMatch(/REDIS_URL/);
    expect(p).toMatch(/https/);
  });

  it('never allows the console SMS provider (codes in logs) in production', () => {
    expect(configProblems({ ...goodProd, SMS_PROVIDER: 'console' }).join(' ')).toMatch(/not allowed in production/);
  });

  it('allows running without phone OTP only when chosen explicitly', () => {
    const noTwilio = { ...goodProd, TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_PHONE_NUMBER: '' };
    expect(configProblems(noTwilio).length).toBeGreaterThan(0);
    expect(configProblems({ ...noTwilio, SMS_PROVIDER: 'none' })).toEqual([]);
    expect(smsProvider({ ...noTwilio, SMS_PROVIDER: 'none' })).toBe('none');
  });

  it('requires an explicit Safepay mode, a return URL and the webhook secret when Safepay keys are set', () => {
    const withKeys = { ...goodProd, SAFEPAY_PUBLIC_KEY: 'pk', SAFEPAY_SECRET_KEY: 'sk' };
    const problems = configProblems(withKeys).join(' ');
    expect(problems).toMatch(/SAFEPAY_SANDBOX/);
    expect(problems).toMatch(/BASE_URL/);
    expect(problems).toMatch(/SAFEPAY_WEBHOOK_SECRET/);
    expect(configProblems({ ...withKeys, SAFEPAY_SANDBOX: 'false', BASE_URL: 'http://api.example.pk', SAFEPAY_WEBHOOK_SECRET: 'wh' }).join(' ')).toMatch(/https/);
    expect(configProblems({ ...withKeys, SAFEPAY_SANDBOX: 'false', BASE_URL: 'https://api.example.pk', SAFEPAY_WEBHOOK_SECRET: 'wh' })).toEqual([]);
  });

  it('requires a persistent directory for local uploads in production', () => {
    expect(configProblems({ ...goodProd, STORAGE_DRIVER: 'local' }).join(' ')).toMatch(/UPLOADS_DIR/);
    expect(configProblems({ ...goodProd, STORAGE_DRIVER: 'local', UPLOADS_DIR: '/data/uploads' })).toEqual([]);
  });

  it('is relaxed in development', () => {
    expect(configProblems({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(10) + 'abcdefghijklmnopqrstuvwxyz' } as any)).toEqual([]);
    expect(emailProvider({ NODE_ENV: 'development' } as any)).toBe('ethereal');
    expect(smsProvider({ NODE_ENV: 'development' } as any)).toBe('console');
  });
});
