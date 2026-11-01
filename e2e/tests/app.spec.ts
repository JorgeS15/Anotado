import { expect, test } from '@playwright/test';
import { card, colorNoteBackup, createTextNote, login, newDevice } from './helpers';

/** Titles unique per project, since desktop and mobile share one server. */
const u = (title: string) => `${title} ${test.info().project.name}`;

test('login rejects a wrong password @mobile', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'errada');
  await page.click('button[type=submit]');
  await expect(page.locator('.error')).toHaveText('Password errada.');
  await page.fill('#password', 'segredo');
  await page.click('button[type=submit]');
  await expect(page.locator('.search input')).toBeVisible();
});

test('text and checklist notes sync live to another device @mobile', async ({ page, browser }) => {
  await login(page);
  const pc = await newDevice(browser);

  await createTextNote(page, u('Sincronizada'), 'Olá do telemóvel');

  await page.click('.fab-btn');
  await page.click('.fab >> text=Checklist');
  await page.fill('.editor .title', u('Mercearia'));
  await page.locator('[data-item]').first().fill('Leite');
  await page.locator('[data-item]').first().press('Enter');
  await page.keyboard.type('Ovos');
  await page.locator('[role=checkbox]').first().click();
  await page.click('[aria-label="Voltar"]');

  await expect(card(pc.page, u('Sincronizada'))).toContainText('Olá do telemóvel');
  await expect(card(pc.page, u('Mercearia'))).toContainText('1/2');
  await pc.context.close();
});

test('offline edits are kept and sent when back online', async ({ page, context, browser }) => {
  await login(page);
  await createTextNote(page, 'Offline', 'antes');
  const pc = await newDevice(browser);
  await expect(card(pc.page, 'Offline')).toBeVisible();

  // Reloading offline needs the service worker to have finished caching the app.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await context.setOffline(true);
  await card(page, 'Offline').click();
  await page.fill('.editor .content', 'editado sem rede');
  await page.keyboard.press('Escape');
  await expect(page.locator('.status')).toBeVisible();

  // The app still opens without a connection, with the local copy.
  await page.reload();
  await expect(card(page, 'Offline')).toContainText('editado sem rede');

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(card(pc.page, 'Offline')).toContainText('editado sem rede', { timeout: 20_000 });
  await pc.context.close();
});

test('concurrent edits keep a conflict copy', async ({ page, context, browser }) => {
  await login(page);
  await createTextNote(page, 'Partilhada', 'original');
  const pc = await newDevice(browser);
  await expect(card(pc.page, 'Partilhada')).toBeVisible();

  // The phone edits offline…
  await context.setOffline(true);
  await card(page, 'Partilhada').click();
  await page.fill('.editor .content', 'versão do telemóvel');
  await page.keyboard.press('Escape');

  // …while the PC edits the same note later.
  await pc.page.waitForTimeout(50);
  await card(pc.page, 'Partilhada').click();
  await pc.page.fill('.editor .content', 'versão do PC');
  await pc.page.keyboard.press('Escape');
  await pc.page.waitForTimeout(700);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  // The newer edit (PC) wins, the phone's is kept as a copy on both devices.
  await expect(card(pc.page, 'Partilhada (conflito)')).toContainText('versão do telemóvel', { timeout: 20_000 });
  await expect(pc.page.locator('.card', { hasText: 'versão do PC' })).toHaveCount(1);
  await expect(card(page, 'Partilhada (conflito)')).toBeVisible({ timeout: 20_000 });
  await pc.context.close();
});

test('trash with undo', async ({ page }) => {
  await login(page);
  await createTextNote(page, 'Para o lixo', 'x');
  await card(page, 'Para o lixo').click();
  await page.click('header button[title="Mais opções"]');
  await page.locator('.panel .item', { hasText: 'Mover para o lixo' }).click();
  await expect(card(page, 'Para o lixo')).toHaveCount(0);
  await page.click('.toast button');
  await expect(card(page, 'Para o lixo')).toBeVisible();
});

test('search ignores accents and highlights matches', async ({ page }) => {
  await login(page);
  await createTextNote(page, 'Receita', 'Bolo com Açúcar mascavado');
  await page.fill('.search input', 'acucar');
  await expect(card(page, 'Receita').locator('mark')).toHaveText('Açúcar');
});

test('select several notes and archive them', async ({ page }) => {
  await login(page);
  await createTextNote(page, 'Seleção A', 'a');
  await createTextNote(page, 'Seleção B', 'b');
  await page.click('[aria-label="Menu"]');
  await page.click('text=Selecionar notas');
  await card(page, 'Seleção A').click();
  await card(page, 'Seleção B').click();
  await expect(page.locator('.selectbar h1')).toHaveText('2 selecionadas');
  await page.click('.selectbar button[title="Arquivar"]');
  await expect(page.locator('.toast')).toContainText('2 notas arquivadas');
  await expect(card(page, 'Seleção A')).toHaveCount(0);

  await page.click('[aria-label="Menu"]');
  await page.click('.panel >> text=Arquivo');
  await expect(card(page, 'Seleção A')).toBeVisible();
  await expect(card(page, 'Seleção B')).toBeVisible();
});

test('long press starts selection @mobile', async ({ page }) => {
  test.skip(!test.info().project.name.includes('mobile'), 'touch only');
  await login(page);
  await createTextNote(page, u('Toque longo'), 'x');
  const box = (await card(page, u('Toque longo')).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.selectbar h1')).toHaveText('1 selecionada');
});

test('history keeps and restores previous versions', async ({ page }) => {
  await login(page);
  await createTextNote(page, 'Com histórico', 'primeira versão');
  await card(page, 'Com histórico').click();
  await page.fill('.editor .content', 'segunda versão');
  await page.waitForTimeout(600);

  await page.click('header button[title="Mais opções"]');
  await page.locator('.panel .item', { hasText: 'Histórico' }).click();
  await page.locator('.version .row').first().click();
  await expect(page.locator('.version pre')).toHaveText('primeira versão');
  await page.click('text=Restaurar esta versão');
  await expect(page.locator('.toast')).toContainText('Versão restaurada');
  await expect(page.locator('.editor .content')).toHaveValue('primeira versão');
});

test('duplicate a note', async ({ page }) => {
  await login(page);
  await createTextNote(page, 'Original único', 'conteúdo');
  await card(page, 'Original único').click();
  await page.click('header button[title="Mais opções"]');
  await page.locator('.panel .item', { hasText: 'Duplicar' }).click();
  await expect(page.locator('.toast')).toContainText('Nota duplicada');
  await page.keyboard.press('Escape');
  await expect(card(page, 'Original único')).toHaveCount(2);
});

test('share target and shortcuts create notes @mobile', async ({ page }) => {
  await login(page);
  const title = u('Partilhado');
  await page.goto(`/share?title=${encodeURIComponent(title)}&text=V%C3%AA%20isto&url=https%3A%2F%2Fexample.com`);
  await expect(page.locator('.editor .title')).toHaveValue(title);
  await expect(page.locator('.editor .content')).toHaveValue('Vê isto\nhttps://example.com');
  await page.click('[aria-label="Voltar"]');
  await expect(card(page, title)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');

  await page.goto('/?new=checklist');
  await expect(page.locator('.editor [data-item]')).toHaveCount(1);
});

test('imports a ColorNote backup', async ({ page }) => {
  await login(page);
  const backup = colorNoteBackup([
    { uuid: 'e2e-1', title: 'Do ColorNote', note: '[ ] Pão\n[V] Café', type: 16, color_index: 4, created_date: 1, modified_date: 2 },
    { uuid: 'e2e-2', title: 'Texto antigo', note: 'Olá', type: 0, color_index: 1, created_date: 1, modified_date: 2 },
  ]);
  await page.click('[aria-label="Menu"]');
  await page.click('text=Importar do ColorNote');
  await page.setInputFiles('.sheet input[type=file]', { name: 'colornote.doc', mimeType: 'application/octet-stream', buffer: backup });
  await page.click('text=Ler backup');
  await expect(page.locator('.sheet')).toContainText('Encontrei 2 notas');
  // Map ColorNote colour 1 to blue instead of the suggested red.
  await page.locator('.colors li', { hasText: 'Cor 1' }).locator('[aria-label="Azul"]').click();
  await page.click('text=Importar 2 notas');
  await expect(page.locator('.toast')).toContainText('2 de 2 notas importadas');
  await expect(card(page, 'Do ColorNote')).toContainText('1/2');
  await expect(card(page, 'Texto antigo')).toHaveAttribute('style', /note-blue/);
});

test('menu shows the app version', async ({ page }) => {
  await login(page);
  await page.click('[aria-label="Menu"]');
  await expect(page.locator('.panel .version')).toHaveText(/^Anotado v\d+\.\d+\.\d+$/);
});
