/**
 * Generate a random 6-digit OTP
 */
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Check if OTP is expired (default: 10 minutes)
 */
export const isOTPExpired = (createdAt: Date, expiryMinutes: number = 10): boolean => {
  const expiryTime = new Date(createdAt.getTime() + expiryMinutes * 60 * 1000);
  return new Date() > expiryTime;
};

/**
 * Format phone number (remove spaces, dashes, etc.)
 */
export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digit characters except +
  let formatted = phone.replace(/[^\d+]/g, '');
  
  // If it doesn't start with +, add country code for Pakistan (+92)
  if (!formatted.startsWith('+')) {
    // If starts with 0, replace with +92
    if (formatted.startsWith('0')) {
      formatted = '+92' + formatted.substring(1);
    } else if (formatted.startsWith('92')) {
      formatted = '+' + formatted;
    } else {
      // Assume it's a local number, add +92
      formatted = '+92' + formatted;
    }
  }
  
  return formatted;
};

/**
 * Validate phone number format
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const formatted = formatPhoneNumber(phone);
  // Pakistan phone numbers: +92XXXXXXXXXXX (10 digits after +92)
  const pakistanPhoneRegex = /^\+92[0-9]{10}$/;
  return pakistanPhoneRegex.test(formatted);
};

