import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('the service worker shows a pushed reminder as a notification', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'uses the Chrome DevTools Protocol');
  await context.grantPermissions(['notifications']);
  await login(page);
  const scope = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // Record what the worker asks to show: whether the system then displays it depends on the machine.
  await worker.evaluate(() => {
    type Show = (title: string, options?: { body?: string; tag?: string }) => Promise<void>;
    const sw = self as unknown as { shown: string[]; registration: { showNotification: Show } };
    sw.shown = [];
    const show = sw.registration.showNotification.bind(sw.registration);
    sw.registration.showNotification = (title: string, options?: { body?: string; tag?: string }) => {
      sw.shown.push(`${title}|${options?.body}|${options?.tag}`);
      return show(title, options).catch(() => undefined);
    };
  });

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
    .poll(() => worker.evaluate(() => (self as unknown as { shown: string[] }).shown))
    .toEqual(['Compras|☐ Leite|note-nota-1']);
});
