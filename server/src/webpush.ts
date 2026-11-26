import { createECDH, createPrivateKey, hkdfSync, randomBytes, sign, createCipheriv, type KeyObject } from 'node:crypto';

/**
 * Minimal Web Push sender, with no dependencies:
 * - VAPID authentication (RFC 8292), signed with ES256.
 * - Payload encryption with "aes128gcm" (RFC 8188 / RFC 8291).
 */

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  /** Uncompressed P-256 public key, base64url (65 bytes). */
  publicKey: string;
  /** P-256 private key, base64url (32 bytes). */
  privateKey: string;
}

const b64 = (buf: Buffer) => buf.toString('base64url');
const unb64 = (text: string) => Buffer.from(text, 'base64url');

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64(ecdh.getPublicKey()), privateKey: b64(ecdh.getPrivateKey()) };
}

function signingKey(keys: VapidKeys): KeyObject {
  const pub = unb64(keys.publicKey);
  return createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64(pub.subarray(1, 33)), y: b64(pub.subarray(33, 65)), d: keys.privateKey },
    format: 'jwk',
  });
}

/** The Authorization header for a push service, valid for 12 hours. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const header = b64(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject };
  const unsigned = `${header}.${b64(Buffer.from(JSON.stringify(claims)))}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key: signingKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64(signature)}, k=${keys.publicKey}`;
}

/**
 * Encrypts a payload for one subscription (RFC 8291). `serverKey` and `salt`
 * are only passed by tests, to reproduce the RFC's example.
 */
export function encryptPayload(
  payload: Buffer,
  subscription: PushSubscription,
  serverKey?: { privateKey: Buffer },
  salt: Buffer = randomBytes(16),
): Buffer {
  const uaPublic = unb64(subscription.keys.p256dh);
  const authSecret = unb64(subscription.keys.auth);
  const ecdh = createECDH('prime256v1');
  if (serverKey) ecdh.setPrivateKey(serverKey.privateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  // One record: the payload followed by the last-record delimiter.
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

export type SendResult = 'sent' | 'gone' | 'failed';

/** Sends one notification. "gone" means the subscription expired and should be forgotten. */
export async function sendPush(
  subscription: PushSubscription,
  payload: unknown,
  keys: VapidKeys,
  subject: string,
  fetcher: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const res = await fetcher(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthorization(subscription.endpoint, keys, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(24 * 3600),
        Urgency: 'high',
      },
      body: new Uint8Array(encryptPayload(Buffer.from(JSON.stringify(payload)), subscription)),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    if (!res.ok) {
      console.error(`Push failed: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return 'failed';
    }
    return 'sent';
  } catch (err) {
    console.error('Push failed:', err instanceof Error ? err.message : err);
    return 'failed';
  }
}
