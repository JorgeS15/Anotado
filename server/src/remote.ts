import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * Copies the daily backups to a WebDAV folder (Nextcloud, ownCloud, a NAS…),
 * so they survive a failure of the server's own disk.
 */

export interface RemoteStatus {
  /** Where backups are sent, without credentials. */
  target: string;
  last_ok?: { name: string; at: number };
  last_error?: { message: string; at: number };
}

export class WebDavUploader {
  private url: string;
  private auth: string | undefined;
  status: RemoteStatus;

  private fetcher: typeof fetch;

  constructor(url: string, user?: string, password?: string, fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
    // fetch refuses URLs with credentials: take them out and send them as Basic auth.
    const parsed = new URL(url.endsWith('/') ? url : `${url}/`);
    user ||= decodeURIComponent(parsed.username) || undefined;
    password ||= decodeURIComponent(parsed.password) || undefined;
    parsed.username = '';
    parsed.password = '';
    this.url = parsed.toString();
    this.auth = user ? `Basic ${Buffer.from(`${user}:${password ?? ''}`).toString('base64')}` : undefined;
    this.status = { target: this.url };
  }

  /** Uploads one backup file. Never throws: the result is kept in `status`. */
  async upload(file: string, now = Date.now()): Promise<boolean> {
    const name = basename(file);
    try {
      const res = await this.fetcher(this.url + encodeURIComponent(name), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(this.auth && { Authorization: this.auth }) },
        body: readFileSync(file),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 404 || res.status === 409 ? ' (a pasta existe?)' : ''}`);
      this.status = { ...this.status, last_ok: { name, at: now }, last_error: undefined };
      return true;
    } catch (err) {
      this.status = { ...this.status, last_error: { message: err instanceof Error ? err.message : String(err), at: now } };
      return false;
    }
  }

  /** True if this backup still has to be sent (never sent, or the last attempt failed). */
  pending(name: string): boolean {
    return this.status.last_ok?.name !== name;
  }
}
