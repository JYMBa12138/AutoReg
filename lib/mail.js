import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 从邮件正文里挑验证码：优先「验证码」字样后面那串数字，其次全文里第一个 4-8 位数字（排除年份）
export function extractCode(text) {
  const t = String(text || '');
  const near = t.match(/(?:验证码|校验码|动态码|确认码|verification code|security code|code)[^0-9]{0,16}(\d{4,8})/i);
  if (near) return near[1];
  // 退路：全文里第一个 4-8 位数字，但排除年份、以及「订单号/手机号/编号」这类
  const NOISE = /(订单|单号|运单|流水|编号|手机|电话|邮编|快递|跟踪|order|tracking|phone|invoice|serial|ref)/i;
  const all = [...t.matchAll(/(?:^|[^0-9])(\d{4,8})(?![0-9])/g)];
  for (const m of all) {
    const c = m[1];
    if (/^(19|20)\d{2}$/.test(c) || /^0+$/.test(c)) continue;
    const before = t.slice(Math.max(0, m.index - 14), m.index);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (NOISE.test(before) || NOISE.test(after)) continue;
    return c;
  }
  return null;
}

const LINK_RE = /https?:\/\/[^\s"'<>)]+/g;
export function extractLink(html, text) {
  const pool = (html || '') + '\n' + (text || '');
  const urls = (pool.match(LINK_RE) || []).map(u => u.replace(/&amp;/g, '&'));
  const hit = urls.find(u => /(verify|confirm|activate|validate|token|mail|email)/i.test(u));
  return hit || urls[0] || null;
}

function clientOf(cfg, emit) {
  return new ImapFlow({
    host: cfg.host,
    port: Number(cfg.port) || 993,
    secure: cfg.secure !== false,
    auth: { user: cfg.user || cfg.email, pass: cfg.pass },
    logger: false,
    socketTimeout: 30000
  });
}

// 连通性测试：连得上、能开收件箱、能读到当前最大 UID 就算通
export async function testMailConfig(cfg) {
  if (!cfg || !cfg.host || !cfg.user || !cfg.pass) return { ok: false, message: 'IMAP 主机 / 账号 / 密码（授权码）都要填' };
  const client = clientOf(cfg);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const exists = client.mailbox ? client.mailbox.exists : 0;
    lock.release();
    await client.logout().catch(() => {});
    return { ok: true, message: '连接成功，收件箱现有 ' + exists + ' 封邮件' };
  } catch (e) {
    await client.logout().catch(() => {});
    return { ok: false, message: '连接失败: ' + ((e && e.message) || String(e)) };
  }
}

// 等新邮件。baselineUid 是发信之前收件箱的最大 UID，只认比它新的，避免翻到旧验证码。
export async function waitForMail(cfg, opts) {
  const { email, emit, timeoutMs = 180000, baselineUid = 0, recentFoldMs = 45000 } = opts || {};
  const client = clientOf(cfg, emit);
  if (emit) emit('log', { text: '连接 IMAP ' + cfg.host + ':' + (cfg.port || 993) });
  await client.connect();
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let baseline = Number(baselineUid) || 0;
  let triedRecent = false;
  try {
    while (Date.now() < deadline) {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const exists = client.mailbox ? client.mailbox.exists : 0;
        if (!baseline) {
          // 没给基线：先取当前最大 UID，从下一封开始等
          baseline = Math.max(0, (client.mailbox.uidNext || 1) - 1);
          if (emit) emit('log', { text: '收件箱 ' + exists + ' 封，从 UID ' + (baseline + 1) + ' 开始等新邮件' });
        }
        // 等够了还没有新邮件，就回头翻最近 20 分钟的（有的站发码早于我们开始等）
        if (!triedRecent && Date.now() - startedAt > recentFoldMs && exists > 0) {
          triedRecent = true;
          const lo = Math.max(1, exists - 19);
          for await (const raw of client.fetch(lo + ':' + exists, { source: true }, { uid: true })) {
            const parsed = await simpleParser(raw.source);
            const subj = parsed.subject || '';
            const code = extractCode(subj + '\n' + (parsed.text || '') + String(parsed.html || ''));
            const link = extractLink(parsed.html, parsed.text);
            if (code || link) {
              if (emit) emit('log', { text: '回头翻收件箱找到「' + subj + '」' + (code ? '，验证码 ' + code : '，含验证链接') });
              return { ok: true, code, link, subject: subj, uid: raw.uid, recent: true };
            }
          }
        }
        if (exists > 0) {
          const from = baseline + 1;
          const to = Math.max(baseline + 50, client.mailbox.uidNext || 1);
          for await (const raw of client.fetch(from + ':' + to, { source: true, envelope: true }, { uid: true })) {
            if (raw.uid <= baseline) continue;
            const parsed = await simpleParser(raw.source);
            const toText = (parsed.to && parsed.to.text) || '';
            const subj = parsed.subject || '';
            const body = (parsed.text || '') + '\n' + String(parsed.html || '');
            const code = extractCode(subj + '\n' + body);
            const link = extractLink(parsed.html, parsed.text);
            const mine = !email || toText.includes(email) || /verify|confirm|activate|验证|确认|注册/i.test(subj);
            if (mine && (code || link)) {
              if (emit) emit('log', { text: '收到邮件「' + subj + '」' + (code ? '，验证码 ' + code : '，含验证链接') });
              return { ok: true, code, link, subject: subj, uid: raw.uid };
            }
            baseline = Math.max(baseline, raw.uid);
          }
        }
      } finally { lock.release(); }
      await sleep(4000);
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { ok: false };
}

// 发信之前先记下收件箱当前最大 UID，之后只认比它新的邮件
export async function getMailBaseline(cfg) {
  const client = clientOf(cfg);
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    const b = Math.max(0, ((client.mailbox && client.mailbox.uidNext) || 1) - 1);
    lock.release();
    return b;
  } finally {
    await client.logout().catch(() => {});
  }
}

// 兜底：不等到新邮件时，回头翻最近 N 分钟的邮件找验证码（有的站一进页面就发码）
export async function findRecentCode(cfg, opts = {}) {
  const { email, minutes = 20 } = opts;
  const client = clientOf(cfg);
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    const hits = [];
    try {
      const total = (client.mailbox && client.mailbox.exists) || 0;
      if (!total) return { ok: false, message: '收件箱是空的' };
      const from = Math.max(1, total - 19);
      for await (const raw of client.fetch(from + ':' + total, { source: true }, { uid: true })) {
        const parsed = await simpleParser(raw.source);
        const toText = (parsed.to && parsed.to.text) || '';
        if (email && toText && !toText.includes(email)) continue;
        const subj = parsed.subject || '';
        const code = extractCode(subj + '\n' + (parsed.text || '') + String(parsed.html || ''));
        if (!code) continue;
        const ts = parsed.date ? new Date(parsed.date).getTime() : 0;
        hits.push({ code, subject: subj, uid: raw.uid, ts });
      }
    } finally { lock.release(); }
    if (!hits.length) return { ok: false, message: '最近没有带验证码的邮件' };
    hits.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const since = Date.now() - minutes * 60000;
    const best = hits.find(h => !h.ts || h.ts >= since) || hits[0];
    return { ok: true, code: best.code, subject: best.subject, uid: best.uid, recent: true };
  } finally {
    await client.logout().catch(() => {});
  }
}

// 兼容旧调用：只要验证链接
export async function fetchVerificationLink(cfg, email, emit) {
  const r = await waitForMail(cfg, { email, emit, timeoutMs: 180000 });
  return r.ok ? r.link : null;
}
