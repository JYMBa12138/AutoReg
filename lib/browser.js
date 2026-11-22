import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
];

export function chromePath() {
  for (const p of CANDIDATES) { if (p && fs.existsSync(p)) return p; }
  return null;
}

// 抹掉自动化痕迹。Turnstile 主要看 navigator.webdriver、chrome 对象、权限查询。
const STEALTH_INIT = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
window.chrome = window.chrome || {};
window.chrome.runtime = window.chrome.runtime || { id: 'mock' };
window.chrome.app = window.chrome.app || { isInstalled: false };
if (!window.chrome.runtime.id) window.chrome.runtime.id = 'mock';
const _query = navigator.permissions && navigator.permissions.query;
if (_query) {
  navigator.permissions.query = (p) => (p && p.name === 'notifications')
    ? Promise.resolve({ state: Notification.permission })
    : _query.call(navigator.permissions, p);
}
`;

const HEADLESS = ['1', 'true', 'yes'].includes(String(process.env.BROWSER_HEADLESS || '').toLowerCase());
// 真实浏览器 UA，避免 HeadlessChrome 字样被 Turnstile 判成机器人
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36 Edg/158.0.0.0';
const CDP_PORT = Number(process.env.CDP_PORT) || 9333;

let browser = null;
let child = null;
let persistent = null;

async function launchPersistent() {
  const dir = path.resolve('data', 'profile');
  fs.mkdirSync(dir, { recursive: true });
  const exe = process.env.CHROMIUM_PATH || chromePath() || undefined;
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: HEADLESS,
    executablePath: exe,
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--lang=zh-CN'
    ]
  });
  await ctx.addInitScript(STEALTH_INIT);
  persistent = ctx;
  return ctx;
}

export async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  const exe = chromePath();
  if (!exe) throw new Error('找不到 Chrome/Chromium，请设置环境变量 CHROME_PATH 或 CHROMIUM_PATH');
  const dir = path.resolve('data', 'cdp-profile');
  fs.mkdirSync(dir, { recursive: true });
  child = spawn(exe, [
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + dir,
    '--no-first-run', '--no-default-browser-check',
    '--disable-features=ChromeWhatsNewUI',
    '--remote-allow-origins=*',
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    'about:blank'
  ], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + CDP_PORT);
  browser.on('disconnect', () => { browser = null; });
  return browser;
}

export async function getContext() {
  if (persistent) return persistent;
  if (HEADLESS) return launchPersistent();
  const b = await getBrowser();
  return b.contexts()[0];
}

export async function closeContext() {
  if (persistent) { try { await persistent.close(); } catch {} persistent = null; }
  if (browser) { try { await browser.close(); } catch {} browser = null; }
  if (child) { try { child.kill(); } catch {} child = null; }
}
