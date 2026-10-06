/** Personal details as they may appear in logs: enough to recognise, not enough to identify. */
export const maskEmail = (email: string) => {
  const [user = '', domain = ''] = String(email).split('@');
  return domain ? `${user.slice(0, 2)}***@${domain}` : '***';
};
export const maskPhone = (phone: string) => (phone.length > 4 ? `***${phone.slice(-4)}` : '***');
