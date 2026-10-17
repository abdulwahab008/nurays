/**
 * Plain wording for what zod found wrong with a form, in place of its own ("Too small: expected string to have >=10
 * characters"). The web app shows the message to the person filling the form in, so it names the field and says what is
 * needed. A message a schema wrote itself (z.string().email('Invalid email format')) is kept as it is: only zod's own wording is replaced.
 */
interface Issue {
  code: string;
  message: string;
  path: ReadonlyArray<PropertyKey>;
}

/** "fullName" -> "Full name", "items.2.quantity" -> "Quantity", "phone_otp" -> "Phone otp"; a field with no name is "This". */
export function fieldLabel(path: ReadonlyArray<PropertyKey>): string {
  const names = path.filter((p) => typeof p !== 'number');
  const last = names[names.length - 1];
  if (typeof last !== 'string' || !last) return 'This';
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const TYPE_WORDS: Record<string, string> = {
  string: 'text',
  number: 'a number',
  int: 'a whole number',
  bigint: 'a whole number',
  boolean: 'true or false',
  array: 'a list',
  object: 'an object',
  date: 'a date',
};

const FORMAT_WORDS: Record<string, string> = {
  email: 'must be a valid email address',
  url: 'must be a valid web address',
  datetime: 'must be a valid date and time',
  date: 'must be a valid date',
  time: 'must be a valid time',
  uuid: 'is not valid',
  guid: 'is not valid',
  regex: 'is not in the right format',
};

// What zod itself calls these formats, as "Invalid <name>": a message that is exactly that is zod's own and gets replaced.
const ZOD_FORMAT_NAMES = new Set([
  'email address', 'URL', 'emoji', 'UUID', 'UUIDv4', 'UUIDv6', 'GUID', 'cuid', 'cuid2', 'ULID', 'XID', 'KSUID', 'ISO datetime', 'ISO date',
  'ISO time', 'ISO duration', 'IPv4 address', 'IPv6 address', 'MAC address', 'IPv4 range', 'IPv6 range', 'base64-encoded string',
  'base64url-encoded string', 'JSON string', 'E.164 number', 'currency code', 'credit card number', 'IBAN', 'JWT', 'input',
]);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The sentence for one problem; the schema's own message when it wrote one. */
export function describeIssue(found: Issue): string {
  const issue = found as Issue & Record<string, unknown>;
  const field = fieldLabel(issue.path);
  const message = issue.message ?? '';

  switch (issue.code) {
    case 'invalid_type': {
      if (!message.startsWith('Invalid input: expected ')) return message;
      if (/received (undefined|null)$/.test(message)) return `${field} is required`;
      const expected = String(issue.expected ?? '');
      return `${field} must be ${TYPE_WORDS[expected] ?? expected}`;
    }
    case 'too_small': {
      if (!message.startsWith('Too small:')) return message;
      const min = Number(issue.minimum);
      const origin = String(issue.origin ?? '');
      if (origin === 'string') return min <= 1 ? `${field} is required` : `${field} must be at least ${min} ${plural(min, 'character', 'characters')}`;
      if (origin === 'array' || origin === 'set') return `${field} needs at least ${min} ${plural(min, 'item', 'items')}`;
      return issue.inclusive === false ? `${field} must be more than ${min}` : `${field} must be ${min} or more`;
    }
    case 'too_big': {
      if (!message.startsWith('Too big:')) return message;
      const max = Number(issue.maximum);
      const origin = String(issue.origin ?? '');
      if (origin === 'string') return `${field} must be at most ${max} ${plural(max, 'character', 'characters')}`;
      if (origin === 'array' || origin === 'set') return `${field} can have at most ${max} ${plural(max, 'item', 'items')}`;
      return issue.inclusive === false ? `${field} must be less than ${max}` : `${field} must be ${max} or less`;
    }
    case 'invalid_format': {
      const isZodsOwn = message.startsWith('Invalid string:') || (message.startsWith('Invalid ') && ZOD_FORMAT_NAMES.has(message.slice('Invalid '.length)));
      if (!isZodsOwn) return message;
      return `${field} ${FORMAT_WORDS[String(issue.format ?? '')] ?? 'is not in the right format'}`;
    }
    case 'invalid_value': {
      const values = Array.isArray(issue.values) ? (issue.values as unknown[]).map(String) : [];
      if (!/^Invalid (input|option)/.test(message) || values.length === 0) return message;
      const shown = values.slice(0, 8).join(', ');
      return `${field} must be one of: ${shown}${values.length > 8 ? ', …' : ''}`;
    }
    case 'unrecognized_keys': {
      const keys = Array.isArray(issue.keys) ? (issue.keys as unknown[]).map(String) : [];
      return keys.length ? `${plural(keys.length, 'Unexpected field', 'Unexpected fields')}: ${keys.join(', ')}` : message;
    }
    default:
      return message;
  }
}
