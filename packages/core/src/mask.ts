const EMAIL_PATTERN = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Mask an email for logs: `jane.doe@uw.edu` → `j***@uw.edu`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** Mask every email address that appears inside free text (error messages, payload dumps). */
export function maskEmailsInText(text: string): string {
  return text.replace(EMAIL_PATTERN, (match) => maskEmail(match));
}

/** Deep-copy a value for logging with every email-looking string masked. */
export function redactForLog<T>(value: T): T {
  if (typeof value === 'string') return maskEmailsInText(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactForLog(v)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactForLog(v)]),
    ) as T;
  }
  return value;
}
