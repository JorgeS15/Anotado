import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'anotado_session';
// Browsers cap cookie lifetime at 400 days.
export const SESSION_MAX_AGE = 400 * 24 * 60 * 60;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function passwordMatches(input: string, expected: string): boolean {
  // Hash both sides so the comparison is constant-time regardless of length.
  return timingSafeEqual(sha256(input), sha256(expected));
}

export function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

export class Sessions {
  private secret: string;
  // Tied to the password, so changing it logs out every device.
  private passwordTag: string;

  constructor(secret: string, password: string) {
    this.secret = secret;
    this.passwordTag = sha256(`anotado:${password}`).toString('hex').slice(0, 16);
  }

  private sign(issued: number): string {
    return createHmac('sha256', this.secret).update(`${issued}:${this.passwordTag}`).digest('base64url');
  }

  create(now = Date.now()): string {
    return `${now}.${this.sign(now)}`;
  }

  verify(token: string | undefined, now = Date.now()): boolean {
    if (!token) return false;
    const [issuedRaw, signature] = token.split('.');
    const issued = Number(issuedRaw);
    if (!Number.isSafeInteger(issued) || !signature) return false;
    if (issued > now + 60_000 || now - issued > SESSION_MAX_AGE * 1000) return false;
    const expected = Buffer.from(this.sign(issued));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

/** Best-effort brute-force protection for the login endpoint. */
export class LoginLimiter {
  private attempts = new Map<string, { count: number; first: number }>();
  private max: number;
  private windowMs: number;

  constructor(max = 10, windowMs = 15 * 60 * 1000) {
    this.max = max;
    this.windowMs = windowMs;
  }

  blocked(key: string, now = Date.now()): boolean {
    const entry = this.attempts.get(key);
    if (!entry) return false;
    if (now - entry.first > this.windowMs) {
      this.attempts.delete(key);
      return false;
    }
    return entry.count >= this.max;
  }

  fail(key: string, now = Date.now()): void {
    const entry = this.attempts.get(key);
    if (!entry || now - entry.first > this.windowMs) {
      this.attempts.set(key, { count: 1, first: now });
    } else {
      entry.count++;
    }
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
