/**
 * Seeds demo data, boots the production build and captures the README screenshots.
 * Requires `npm run build` first and a local Chrome (set CHROME_PATH to override).
 */
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 3123;
const BASE = `http://localhost:${PORT}`;
const OUT = 'docs/screenshots';
const env = { ...process.env, DATA_DIR: './data-demo', PORT: String(PORT), TICK_EMAIL: 'demo@tick.app', TICK_PASSWORD: 'demo' };
const nodeArgs = ['--disable-warning=ExperimentalWarning'];

const seedOutput = execFileSync(process.execPath, [...nodeArgs, 'scripts/seed.ts'], { env, encoding: 'utf8' });
const shareToken = seedOutput.match(/share token: (\S+)/)[1];

const server = spawn(process.execPath, [...nodeArgs, 'server/index.ts'], { env, stdio: 'inherit' });
await new Promise((resolve) => setTimeout(resolve, 1500));

const executablePath =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome');

const browser = await chromium.launch({ executablePath });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2, locale: 'en-US' });
  const page = await context.newPage();
  const settle = () => page.waitForTimeout(900);

  await page.goto(BASE);
  await page.getByLabel('Email').waitFor();
  await settle();
  await page.screenshot({ path: `${OUT}/login.png` });

  await page.getByLabel('Email').fill('demo@tick.app');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('.timer-card').waitFor();
  await settle();
  await page.screenshot({ path: `${OUT}/dashboard.png` });

  await page.getByRole('button', { name: 'Previous month' }).click();
  await page.locator('.log-day').first().waitFor();
  await settle();
  await page.screenshot({ path: `${OUT}/month.png`, fullPage: true });
  await page.getByRole('button', { name: 'This month' }).click();

  await page.getByRole('button', { name: 'Share' }).click();
  await settle();
  await page.screenshot({ path: `${OUT}/share-dialog.png` });
  await page.keyboard.press('Escape');

  const share = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' });
  const sharePage = await share.newPage();
  await sharePage.goto(`${BASE}/s/${shareToken}`);
  await sharePage.locator('.kpis').waitFor();
  await sharePage.waitForTimeout(900);
  await sharePage.screenshot({ path: `${OUT}/share-page.png`, fullPage: true });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'en-US' });
  await mobile.addCookies(await context.cookies());
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(BASE);
  await mobilePage.locator('.timer-card').waitFor();
  await mobilePage.waitForTimeout(900);
  await mobilePage.screenshot({ path: `${OUT}/mobile.png` });
} finally {
  await browser.close();
  server.kill();
}
console.log(`Screenshots saved to ${OUT}/`);
