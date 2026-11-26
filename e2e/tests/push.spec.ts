import { expect, test } from '@playwright/test';
import { login } from './helpers';

// The headless shell does not show notifications; the full Chromium (new headless mode) does.
test.use({ channel: 'chromium' });

test('the service worker shows a pushed reminder as a notification', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'uses the Chrome DevTools Protocol');
  await context.grantPermissions(['notifications']);
  await login(page);
  const scope = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  const registrationId = await new Promise<string>((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => {
      const reg = e.registrations.find((r) => r.scopeURL === scope && !r.isDeleted);
      if (reg) resolve(reg.registrationId);
    });
  });
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(scope).origin,
    registrationId,
    data: JSON.stringify({ title: 'Compras', body: '☐ Leite', id: 'nota-1' }),
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return (await reg.getNotifications()).map((n) => `${n.title}|${n.body}|${n.tag}`);
      }),
    )
    .toEqual(['Compras|☐ Leite|note-nota-1']);
});
