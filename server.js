import express from 'express';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { register } from './lib/registrar.js';
import { resolveSite, listSites } from './lib/sites.js';
import { getContext, closeContext } from './lib/browser.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

// 可选访问口令：设了 ACCESS_TOKEN 就必须带口令，否则只在本机/局域网自用
const ACCESS_TOKEN = String(process.env.ACCESS_TOKEN || '').trim();
function tokenOk(req) {
  if (!ACCESS_TOKEN) return true;
  if (req.get('x-access-token') === ACCESS_TOKEN) return true;
  if (String(req.query.token || '') === ACCESS_TOKEN) return true;
  const raw = req.headers.cookie || '';
  return raw.split(';').some(s => {
    const i = s.indexOf('=');
    return i > 0 && s.slice(0, i).trim() === 'autoreg_token' && decodeURIComponent(s.slice(i + 1).trim()) === ACCESS_TOKEN;
  });
}

app.post('/api/login', (req, res) => {
  const t = String((req.body && req.body.token) || '');
  if (!ACCESS_TOKEN || t !== ACCESS_TOKEN) return res.status(401).json({ ok: false, message: '口令不对' });
  res.setHeader('Set-Cookie', 'autoreg_token=' + encodeURIComponent(ACCESS_TOKEN) + '; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax');
  res.json({ ok: true });
});

app.use((req, res, next) => {
  if (!ACCESS_TOKEN || req.path === '/api/login' || req.path === '/login.html') return next();
  if (tokenOk(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ ok: false, message: '需要访问口令' });
  return res.redirect('/login.html');
});

app.use(express.static(path.join(process.cwd(), 'public')));
fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });

let state = { state: 'idle', text: '待命' };
let logs = [];
let running = false;
const clients = new Set();

function broadcast(ev) {
  const payload = 'data: ' + JSON.stringify(ev) + '\n\n';
  for (const res of clients) { try { res.write(payload); } catch {} }
}

function emit(type, data) {
  const ev = Object.assign({ type, ts: Date.now() }, data || {});
  if (type === 'status') state = { state: data.state, text: data.text };
  if (type === 'log') { logs.push({ t: ev.ts, text: data.text }); if (logs.length > 500) logs.shift(); }
  broadcast(ev);
  if (type === 'shot') snap();
}

async function snap() {
  try {
    const ctx = await getContext();
    const pages = ctx.pages();
    const page = pages[pages.length - 1];
    if (!page) return;
    await page.screenshot({ path: path.join(process.cwd(), 'data', 'last.png') });
    broadcast({ type: 'shot', v: Date.now(), ts: Date.now() });
  } catch (e) {}
}

app.get('/api/sites', (req, res) => {
  res.json({ sites: listSites() });
});

app.get('/api/state', (req, res) => {
  res.json({ state, logs, running });
});

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.get('/api/shot', (req, res) => {
  const p = path.join(process.cwd(), 'data', 'last.png');
  if (!fs.existsSync(p)) return res.status(404).end();
  res.set('Cache-Control', 'no-store');
  res.sendFile(p);
});

app.post('/api/shutdown', async (req, res) => {
  await closeContext();
  emit('status', { state: 'idle', text: '浏览器已关闭' });
  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  if (running) return res.status(409).json({ ok: false, message: '已有任务在跑' });
  const b = req.body || {};
  const site = resolveSite(String(b.site || '') || String(b.url || ''));
  const url = String(b.url || '').trim() || String(site.signupUrl || '').trim();
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  if (!url) return res.status(400).json({ ok: false, message: '没给注册地址，站点配置里也没有默认地址' });
  if (!username || !password) return res.status(400).json({ ok: false, message: '邮箱/用户名和密码都要填' });
  if (password.length < 8) return res.status(400).json({ ok: false, message: '密码至少 8 位' });
  running = true;
  logs = [];
  emit('status', { state: 'opening', text: '启动' });
  res.json({ ok: true, accepted: true });
  try {
    emit('log', { text: '站点: ' + site.name });
    const out = await register({
      site,
      url, username, password,
      confirmPassword: String(b.confirmPassword || password),
      mail: b.mail || null,
      dryRun: !!b.dryRun,
      timeoutMs: Number(b.timeoutMs) || 300000
    }, emit);
    emit('result', out);
  } catch (e) {
    const msg = (e && e.message) ? e.message.split('\n')[0] : String(e);
    emit('log', { text: '出错: ' + msg });
    emit('status', { state: 'error', text: '出错: ' + msg });
    emit('result', { ok: false, message: '出错: ' + msg });
  } finally {
    running = false;
  }
});

const port = Number(process.env.PORT) || 3123;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  const nets = os.networkInterfaces();
  const lan = [];
  for (const list of Object.values(nets)) for (const n of list || []) {
    if (n.family === 'IPv4' && !n.internal) lan.push('http://' + n.address + ':' + port);
  }
  console.log('AutoReg listening on ' + host + ':' + port);
  console.log('  本机: http://127.0.0.1:' + port);
  for (const u of lan) console.log('  局域网: ' + u);
  if (process.env.BROWSER_HEADLESS) console.log('  浏览器模式: 无头(stealth)');
  if (ACCESS_TOKEN) console.log('  已启用访问口令');
});
