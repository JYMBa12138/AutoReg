import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromePath } from '../lib/browser.js';

const port = 9333;
const dir = 'D:\\aaaaaaaaaaaaaaaaaaaa\\AutoReg\\data\\cdp-profile';
fs.mkdirSync(dir, { recursive: true });
const exe = chromePath();
console.log('CHROME', exe);
const child = spawn(exe, [
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + dir,
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=ChromeWhatsNewUI',
  'about:blank'
], { detached: false, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] || await ctx.newPage();
const wd = await page.evaluate(() => navigator.webdriver);
console.log('WEBDRIVER', wd);
await page.goto('https://chuan.sylu.cc/sign-up?aff=UpsG', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 30000 });
await page.fill('input[name="username"]', 'smoke_test_user');
await page.fill('input[name="password"]', 'SmokeTest123');
await page.fill('input[name="confirmPassword"]', 'SmokeTest123');
const t0 = Date.now();
let token = '';
for (let i = 0; i < 20; i++) {
  token = await page.evaluate(() => { const el = document.querySelector('[name="cf-turnstile-response"]'); return el ? el.value : ''; }).catch(() => '');
  if (token) { console.log('TOKEN_AFTER_MS', Date.now() - t0, 'len', token.length); break; }
  await page.waitForTimeout(1000);
}
if (!token) { console.log('NO_TOKEN_AFTER_MS', Date.now() - t0); }
await page.screenshot({ path: 'data/smoke5.png' });
await browser.close();
child.kill();
