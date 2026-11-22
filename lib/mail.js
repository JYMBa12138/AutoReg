import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function linkFrom(html, text) {
  const pool = (html || '') + '\n' + (text || '');
  const urls = pool.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  const hit = urls.find(u => /(verify|confirm|activate|validate|token|code)/i.test(u));
  return hit || urls[0] || null;
}

export async function fetchVerificationLink(cfg, email, emit) {
  const client = new ImapFlow({
    host: cfg.host,
    port: Number(cfg.port) || 993,
    secure: cfg.secure !== false,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false
  });
  emit('log', { text: '连接 IMAP ' + cfg.host + ':' + (cfg.port || 993) });
  await client.connect();
  const deadline = Date.now() + 180000;
  try {
    while (Date.now() < deadline) {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const exists = client.mailbox.exists || 0;
        if (exists > 0) {
          const start = Math.max(1, exists - 9);
          for await (const raw of client.fetch(start + ':*', { source: true, envelope: true })) {
            const parsed = await simpleParser(raw.source);
            const to = (parsed.to && parsed.to.text) || '';
            const subj = parsed.subject || '';
            if (!email || to.includes(email) || /verify|confirm|activate|验证|确认/i.test(subj)) {
              const link = linkFrom(parsed.html, parsed.text);
              if (link) { emit('log', { text: '找到邮件: ' + subj }); return link; }
            }
          }
        }
      } finally { lock.release(); }
      await sleep(8000);
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return null;
}
