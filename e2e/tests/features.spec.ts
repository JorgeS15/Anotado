import { expect, test } from '@playwright/test';
import { API_TOKEN } from '../playwright.config';
import { card, login, newDevice } from './helpers';

async function createChecklist(page: import('@playwright/test').Page, title: string, items: string[]) {
  await page.click('.fab-btn');
  await page.click('.fab >> text=Checklist');
  await page.fill('.editor .title', title);
  await page.locator('.editor [data-item]').first().fill(items[0]);
  for (const text of items.slice(1)) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(text);
  }
}

const itemTexts = (page: import('@playwright/test').Page) =>
  page.locator('.editor [data-item]').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));

test('checklist: uncheck all, delete done and hide done items', async ({ page }) => {
  await login(page);
  await createChecklist(page, 'Compras da semana', ['Leite', 'Pão', 'Ovos']);
  const boxes = page.locator('.editor [role=checkbox]');
  await boxes.nth(0).click();
  await boxes.nth(0).click();
  await expect(page.locator('.editor .done-label')).toContainText('2 itens concluídos');

  // Collapse and expand the done items.
  await page.click('.editor .done-label');
  await expect(page.locator('.editor [data-item]')).toHaveCount(1);
  await page.click('.editor .done-label');
  await expect(page.locator('.editor [data-item]')).toHaveCount(3);

  await page.click('header button[title="Mais opções"]');
  await page.locator('.panel .item', { hasText: 'Desmarcar tudo' }).click();
  await expect(page.locator('.editor .done-label')).toHaveCount(0);
  await page.click('.toast button');
  await expect(page.locator('.editor .done-label')).toContainText('2 itens concluídos');

  await page.click('header button[title="Mais opções"]');
  await page.locator('.panel .item', { hasText: 'Apagar concluídos' }).click();
  await expect(page.locator('.toast')).toContainText('2 itens apagados');
  expect(await itemTexts(page)).toEqual(['Ovos']);
});

test('checklist items move with Alt+arrows', async ({ page }) => {
  await login(page);
  await createChecklist(page, 'Ordem', ['Um', 'Dois', 'Três']);
  await page.locator('.editor [data-item]').nth(2).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  expect(await itemTexts(page)).toEqual(['Três', 'Um', 'Dois']);
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.editor .done-label')).toContainText('1 item concluído');
});

test('colour names are shared with other devices and shown in the filter', async ({ page, browser }) => {
  await login(page);
  const pc = await newDevice(browser);
  await page.click('[aria-label="Menu"]');
  await page.click('text=Nomes das cores');
  await page.getByLabel('Nome para Verde').fill('Compras');
  await page.click('.sheet >> text=Guardar');
  await expect(page.locator('[aria-label="Filtrar: Compras"]')).toBeVisible();
  await expect(pc.page.locator('[aria-label="Filtrar: Compras"]')).toBeVisible();
  await pc.page.click('[aria-label="Filtrar: Compras"]');
  await expect(pc.page.locator('.filter-name')).toHaveText('Compras');
  await pc.context.close();

  await page.click('[aria-label="Menu"]');
  await page.click('text=Nomes das cores');
  await page.getByLabel('Nome para Verde').fill('');
  await page.click('.sheet >> text=Guardar');
  await expect(page.locator('[aria-label="Filtrar: Verde"]')).toBeVisible();
});

test('an automation adds items to a list with the API token', async ({ page, request }) => {
  await login(page);
  const res = await request.post('/api/lists/items', {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    data: { list: 'Lista da API', items: ['Café', 'Açúcar'] },
  });
  expect(res.ok()).toBeTruthy();
  // Shown live, without reloading.
  await expect(card(page, 'Lista da API')).toContainText('Café');
  await expect(card(page, 'Lista da API')).toContainText('Açúcar');

  const denied = await request.post('/api/lists/items', {
    headers: { Authorization: 'Bearer errado' },
    data: { list: 'Lista da API', items: ['x'] },
  });
  expect(denied.status()).toBe(401);
});

test('server status lists backups and the shortcuts help opens with ?', async ({ page }) => {
  await login(page);
  await page.click('[aria-label="Menu"]');
  await page.click('text=Servidor e backups');
  await expect(page.locator('.sheet .stats')).toContainText('Notas');
  await expect(page.locator('.sheet .backups li')).toHaveCount(1);
  await expect(page.locator('.sheet')).toContainText('Token de API (automações): ativo');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet')).toHaveCount(0);

  await page.keyboard.press('?');
  await expect(page.locator('.sheet')).toContainText('Atalhos de teclado');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet')).toHaveCount(0);
});

test('restores the notes of a daily backup', async ({ page }) => {
  await login(page);
  const status = await (await page.request.get('/api/status')).json();
  const name = status.backups[0].name;
  // Notes are not in the backup written when the server started, so restoring keeps them.
  await page.click('[aria-label="Menu"]');
  await page.click('text=Servidor e backups');
  page.once('dialog', (d) => d.accept());
  await page.locator('.sheet .backups li').first().locator('text=Restaurar').click();
  await expect(page.locator('.toast')).toContainText(/backup/);
  expect(name).toMatch(/^anotado-\d{4}-\d{2}-\d{2}\.json$/);
});

test('Ctrl+Enter closes a note and the status bar takes its colour @mobile', async ({ page }) => {
  await login(page);
  const themeColor = () => page.locator('meta[name="theme-color"]').getAttribute('content');
  const appColor = await themeColor();
  await page.click('.fab-btn');
  await page.click('.fab >> text=Texto');
  await page.fill('.editor .title', `Azul ${test.info().project.name}`);
  await page.click('.editor button[title="Cor"]');
  await page.click('.editor [aria-label="Azul"]');
  if (test.info().project.name === 'mobile') await expect.poll(themeColor).toBe('#cfe4ff');
  await page.locator('.editor .title').press('Control+Enter');
  await expect(page.locator('.editor')).toHaveCount(0);
  await expect.poll(themeColor).toBe(appColor);
});

test('a checklist saved as a template creates new lists with the items unticked', async ({ page }) => {
  await login(page);
  await createChecklist(page, 'Mala de viagem', ['Escova', 'Carregador']);
  await page.locator('.editor [role=checkbox]').first().click();
  await page.click('header button[title="Mais opções"]');
  page.once('dialog', (d) => d.accept('Mala'));
  await page.locator('.panel .item', { hasText: 'Guardar como modelo' }).click();
  await expect(page.locator('.toast')).toContainText('Modelo "Mala" guardado');
  await page.keyboard.press('Escape');

  await page.click('.fab-btn');
  await page.locator('.fab .item', { hasText: 'Mala' }).click();
  await expect(page.locator('.editor .title')).toHaveValue('Mala de viagem');
  expect(await itemTexts(page)).toEqual(['Escova', 'Carregador']);
  await expect(page.locator('.editor .done-label')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card(page, 'Mala de viagem')).toHaveCount(2);

  await page.click('.fab-btn');
  await page.click('.fab >> text=Gerir modelos');
  await page.click('[aria-label="Apagar modelo Mala"]');
  await expect(page.locator('.sheet')).toContainText('Ainda não tens modelos');
});

test('manual order: drag a note or move it with Alt+arrows, on every device', async ({ page, browser }) => {
  await login(page);
  const names = ['Ordem A', 'Ordem B', 'Ordem C'];
  for (const name of names) {
    await page.click('.fab-btn');
    await page.click('.fab >> text=Texto');
    await page.fill('.editor .title', name);
    await page.fill('.editor .content', 'x');
    await page.keyboard.press('Escape');
  }
  await page.fill('.search input', '');
  await page.click('button[title="Ordenar"]');
  await page.click('.panel >> text=Manual');
  const order = async (p = page) =>
    (await p.locator('.card h3').allTextContents()).filter((t) => t.startsWith('Ordem '));
  // New notes come first, newest first.
  expect(await order()).toEqual(['Ordem C', 'Ordem B', 'Ordem A']);

  // Drag C onto B: it goes after B.
  const grip = card(page, 'Ordem C').locator('.grip');
  const from = (await grip.boundingBox())!;
  const to = (await card(page, 'Ordem B').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(order).toEqual(['Ordem B', 'Ordem C', 'Ordem A']);

  await card(page, 'Ordem A').focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(order).toEqual(['Ordem A', 'Ordem B', 'Ordem C']);

  // The order is shared; the other device sorts by hand too once it picks "Manual".
  const pc = await newDevice(browser);
  await pc.page.click('button[title="Ordenar"]');
  await pc.page.click('.panel >> text=Manual');
  await expect.poll(() => order(pc.page)).toEqual(['Ordem A', 'Ordem B', 'Ordem C']);
  await pc.context.close();
});

test('dragging a checklist item saves the new order', async ({ page, browser }) => {
  await login(page);
  await createChecklist(page, 'Arrastar itens', ['Primeiro', 'Segundo', 'Terceiro']);
  const grip = page.locator('.editor li', { hasText: '' }).nth(2).locator('.grip');
  const from = (await grip.boundingBox())!;
  const to = (await page.locator('.editor li').first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await itemTexts(page)).toEqual(['Terceiro', 'Primeiro', 'Segundo']);
  await page.keyboard.press('Escape');
  const pc = await newDevice(browser);
  await card(pc.page, 'Arrastar itens').click();
  expect(await itemTexts(pc.page)).toEqual(['Terceiro', 'Primeiro', 'Segundo']);
  await pc.context.close();
});

test('checklist sub-items with Tab, kept on other devices and in the Markdown export', async ({ page, browser }) => {
  await login(page);
  await createChecklist(page, 'Talho e peixaria', ['Talho', 'Frango']);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Carne picada');
  await expect(page.locator('.editor li.sub')).toHaveCount(2);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.editor li.sub')).toHaveCount(1);
  await page.keyboard.press('Tab');

  await page.click('header button[title="Mais opções"]');
  const download = page.waitForEvent('download');
  await page.locator('.panel .item', { hasText: 'Descarregar (.md)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('talho-e-peixaria.md');
  const text = await (await file.createReadStream()).toArray();
  expect(Buffer.concat(text).toString()).toBe('# Talho e peixaria\n\n- [ ] Talho\n  - [ ] Frango\n  - [ ] Carne picada\n');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const pc = await newDevice(browser);
  await expect(card(pc.page, 'Talho e peixaria').locator('li.sub')).toHaveCount(2);
  await pc.context.close();
});
