import net from 'node:net';

// 极简假 IMAP：只为本地测试「自动收验证码」链路。单个 INBOX，一封含验证码的信。
const CODE = '482913';
const RAW = [
  'From: Fake Site <no-reply@fake.test>',
  'To: tester@example.com',
  'Subject: =?UTF-8?B?' + Buffer.from('您的验证码').toString('base64') + '?=',
  'Date: ' + new Date().toUTCString(),
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  '您的验证码：' + CODE + '，10 分钟内有效。'
].join('\r\n');

function handle(sock) {
  sock.setEncoding('utf8');
  sock.write('* OK fake imap ready\r\n');
  let buf = '';
  sock.on('data', (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const m = line.match(/^(\S+)\s+(\S+)(?:\s+(.*))?$/);
      if (!m) continue;
      const [, tag, cmdRaw, rest] = m;
      const cmd = cmdRaw.toUpperCase();
      const arg = (rest || '').toUpperCase();

      if (cmd === 'CAPABILITY') {
        sock.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n' + tag + ' OK CAPABILITY done\r\n');
      } else if (cmd === 'LOGIN') {
        sock.write(tag + ' OK LOGIN done\r\n');
      } else if (cmd === 'LIST' || cmd === 'LSUB') {
        sock.write('* LIST (\\HasNoChildren) "/" "INBOX"\r\n' + tag + ' OK LIST done\r\n');
      } else if (cmd === 'SELECT' || cmd === 'EXAMINE') {
        sock.write('* 1 EXISTS\r\n* 0 RECENT\r\n* FLAGS (\\Seen \\Deleted)\r\n* OK [UIDVALIDITY 1] ok\r\n* OK [UIDNEXT 3] ok\r\n* OK [PERMANENTFLAGS (\\Seen \\Deleted)] ok\r\n');
        sock.write(tag + ' OK [READ-WRITE] SELECT done\r\n');
      } else if (cmd === 'FETCH' || cmd === 'UID') {
        const range = (rest || '').split(/\s+/).find(x => /^\d+:[^\s]*$/.test(x)) || '1';
        const uid = Math.max(1, parseInt(range, 10) || 1);
        const bytes = Buffer.byteLength(RAW, 'utf8');
        sock.write('* 1 FETCH (UID ' + uid + ' RFC822.SIZE ' + bytes + ' BODY[] {' + bytes + '}\r\n');
        sock.write(RAW + ')\r\n');
        sock.write(tag + ' OK FETCH done\r\n');
      } else if (cmd === 'LOGOUT') {
        sock.write('* BYE bye\r\n' + tag + ' OK LOGOUT done\r\n');
        sock.end();
      } else if (cmd === 'NOOP' || cmd === 'CLOSE' || cmd === 'ID') {
        sock.write(tag + ' OK done\r\n');
      } else {
        sock.write(tag + ' OK fallback\r\n');
      }
    }
  });
  sock.on('error', () => {});
}

net.createServer(handle).listen(1993, '127.0.0.1', () => console.log('fake imap 1993'));
