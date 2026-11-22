import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 从邮件正文里挑验证码：优先「验证码」字样后面那串数字，其次全文里第一个 4-8 位数字（排除年份）
export function extractCode(text) {
  const t = String(text || '');
  const near = t.match(/(?:验证码|校验码|动态码|确认码|verification code|security code|code)[^0-9]{0,16}(\d{4,8})/i);
  if (near) return near[1];
  const all = [...t.matchAll(/(?:^|[^0-9])(\d{4,8})(?![0-9])/g)].map(m => m[1]);
  const good = all.filter(c => !/^(19|20)\d{2}$/.test(c) && !/^0+$/.test(c));
  return good[0] || null;
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
  const { email, emit, timeoutMs = 180000, baselineUid = 0 } = opts || {};
  const client = clientOf(cfg, emit);
  if (emit) emit('log', { text: '连接 IMAP ' + cfg.host + ':' + (cfg.port || 993) });
  await client.connect();
  const deadline = Date.now() + timeoutMs;
  let baseline = Number(baselineUid) || 0;
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

// 兼容旧调用：只要验证链接
export async function fetchVerificationLink(cfg, email, emit) {
  const r = await waitForMail(cfg, { email, emit, timeoutMs: 180000 });
  return r.ok ? r.link : null;
}
