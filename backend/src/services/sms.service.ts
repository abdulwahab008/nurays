/**
 * SMS. Provider (see config/env.ts smsProvider):
 *  - twilio:  real SMS (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER)
 *  - console: prints the message to this console; development / test only (refused in production)
 *  - none:    no SMS at all; anything that needs one fails clearly
 *
 * sendSMS reports whether the message was actually handed to the provider, so callers
 * never tell a user "code sent" when it wasn't.
 */
import { smsProvider } from '../config/env';
import { maskPhone } from '../utils/mask';

let twilioClient: any = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  try {
    // Loaded on first use so a deployment without Twilio never needs the package.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require('twilio');
    twilioClient = twilio(sid, token, { timeout: 15000 });
    return twilioClient;
  } catch {
    return null;
  }
}

/** Last 4 digits only, for logs. */

export async function sendSMS(phone: string, message: string): Promise<boolean> {
  const provider = smsProvider();

  if (provider === 'twilio') {
    const client = getTwilioClient();
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!client || !from) {
      console.error('SMS: Twilio is selected but not configured correctly');
      return false;
    }
    // One retry for a transient failure (network, 5xx).
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await client.messages.create({ body: message, from, to: phone });
        return true;
      } catch (err: any) {
        const transient = !err?.status || err.status >= 500;
        console.error(`SMS to ${maskPhone(phone)} failed (attempt ${attempt}): ${err?.message ?? err}`);
        if (!transient) break;
      }
    }
    return false;
  }

  if (provider === 'console') {
    console.log('\n📱 SMS (console provider, development only)');
    console.log(`To: ${phone}`);
    console.log(`Message: ${message}\n`);
    return true;
  }

  console.error(`SMS to ${maskPhone(phone)} not sent: no SMS provider is configured (SMS_PROVIDER=none)`);
  return false;
}

/** Send OTP message to phone (used by OTP service). */
export async function sendOTPSMS(phone: string, otpCode: string, _purpose: string): Promise<boolean> {
  const message = `Your Nuray verification code is: ${otpCode}. Valid for 10 minutes. Do not share.`;
  return sendSMS(phone, message);
}

export default { sendSMS, sendOTPSMS };
