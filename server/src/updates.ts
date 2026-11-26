/**
 * Checks, at most once a day, whether a newer Anotado release exists on GitHub.
 * Only the public releases API is called; nothing about this server is sent.
 */

export const RELEASES_URL = 'https://api.github.com/repos/JorgeS15/Anotado/releases/latest';
const INTERVAL = 24 * 60 * 60 * 1000;
const RETRY = 60 * 60 * 1000;

/** Compares two "X.Y.Z" versions (an optional leading "v" is ignored). */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((p) => Number.parseInt(p, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

export class UpdateChecker {
  private latest: string | null = null;
  private url: string | null = null;
  private checkedAt = 0;
  private running: Promise<void> | undefined;

  private current: string;
  private fetcher: typeof fetch;

  constructor(current: string, fetcher: typeof fetch = fetch) {
    this.current = current;
    this.fetcher = fetcher;
  }

  /** The newest release, if it is newer than this server. Starts a check in the background when due. */
  available(now = Date.now()): { version: string; url: string } | null {
    if (now - this.checkedAt > INTERVAL) void this.check(now);
    if (!this.latest || compareVersions(this.latest, this.current) <= 0) return null;
    return { version: this.latest, url: this.url ?? '' };
  }

  check(now = Date.now()): Promise<void> {
    this.running ??= (async () => {
      try {
        const res = await this.fetcher(RELEASES_URL, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Anotado' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { tag_name?: string; html_url?: string };
        if (typeof body.tag_name === 'string') {
          this.latest = body.tag_name.replace(/^v/, '');
          this.url = typeof body.html_url === 'string' ? body.html_url : null;
        }
        this.checkedAt = now;
      } catch {
        // Offline or rate limited: try again in an hour.
        this.checkedAt = now - INTERVAL + RETRY;
      } finally {
        this.running = undefined;
      }
    })();
    return this.running;
  }
}
