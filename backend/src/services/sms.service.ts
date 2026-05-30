/**
 * SMS service – sends OTP and other SMS via Twilio when configured.
 * When Twilio is not configured, logs to console (development).
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: any = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    return twilioClient;
  } catch {
    return null;
  }
}

/**
 * Send an SMS. Uses Twilio if env vars are set; otherwise logs to console.
 * Phone number should be in E.164 format (e.g. +923001234567).
 */
export async function sendSMS(phone: string, message: string): Promise<boolean> {
  const client = getTwilioClient();
  const from = TWILIO_PHONE_NUMBER;

  if (client && from) {
    try {
      await client.messages.create({
        body: message,
        from,
        to: phone,
      });
      console.log(`📱 SMS sent to ${phone}`);
      return true;
    } catch (err) {
      console.error('Twilio SMS error:', err);
      return false;
    }
  }

  // No Twilio config – log for development
  console.log('\n📱 SMS (Console – configure Twilio for real SMS):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`To: ${phone}`);
  console.log(`Message: ${message}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  return true;
}

/**
 * Send OTP message to phone (used by OTP service).
 */
export async function sendOTPSMS(phone: string, otpCode: string, _purpose: string): Promise<boolean> {
  const message = `Your Nuray verification code is: ${otpCode}. Valid for 10 minutes. Do not share.`;
  return sendSMS(phone, message);
}

export default { sendSMS, sendOTPSMS };
