import { expect, type Browser, type Page } from '@playwright/test';
import { createCipheriv, createHash } from 'node:crypto';

export const PASSWORD = 'segredo';

export async function login(page: Page, path = '/') {
  await page.goto(path);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await expect(page.locator('.search input')).toBeVisible();
}

/** A second, independent device (own storage and client id). */
export async function newDevice(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  return { context, page };
}

export async function createTextNote(page: Page, title: string, content: string) {
  await page.click('.fab-btn');
  await page.click('.fab >> text=Texto');
  await page.fill('.editor .title', title);
  await page.fill('.editor .content', content);
  await page.keyboard.press('Escape');
  await expect(page.locator('.editor')).toHaveCount(0);
}

export function card(page: Page, title: string) {
  return page.locator('.card', { has: page.locator('h3', { hasText: title }) });
}

/** Builds a ColorNote-style encrypted backup (V2 layout). */
export function colorNoteBackup(records: object[], password = '0000'): Buffer {
  const salt = Buffer.from('ColorNote Fixed Salt');
  const pass = Buffer.from(password);
  const key = createHash('md5').update(pass).update(salt).digest();
  const iv = createHash('md5').update(key).update(pass).update(salt).digest();
  const parts = [Buffer.alloc(16, 7)];
  for (const r of records) {
    const json = Buffer.from(JSON.stringify(r));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(json.length);
    parts.push(len, json);
  }
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([Buffer.alloc(28), cipher.update(Buffer.concat(parts)), cipher.final()]);
}
