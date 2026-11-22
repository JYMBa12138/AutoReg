import { getContext } from './browser.js';
import { fetchVerificationLink } from './mail.js';
import { resolveSite } from './sites.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const normUrl = u => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
const CAPTCHA_IFRAME = /recaptcha|hcaptcha|turnstile|challenges\.cloudflare|geetest|nc_1_n1z|aliyun|滑块/i;

async function fillPasswords(page, password, confirmValue, emit) {
  const pws = page.locator('input[type="password"]');
  const n = await pws.count().catch(() => 0);
  if (n === 0) return false;
  await pws.nth(0).fill(String(password), { timeout: 8000 });
  emit('log', { text: '已填密码' });
  if (n >= 2) {
    await pws.nth(1).fill(String(confirmValue), { timeout: 8000 });
    emit('log', { text: '已填确认密码' });
  }
  return true;
}

async function fillForm(page, site, username, password, confirmPassword, emit) {
  const filled = [];
  const emailSel = site.fields.email || 'input[type="email"], #email';
  if (await fillField(page, emailSel, username, '邮箱', emit)) filled.push('email');
  const userSel = site.fields.username || 'input[name="username"], #username';
  if (await fillField(page, userSel, username, '用户名', emit)) filled.push('username');
  if (await fillPasswords(page, password, confirmPassword || password, emit)) filled.push('password');
  if (filled.length) emit('log', { text: '已填字段: ' + filled.join(', ') });
  return filled.length > 0;
}

async function fillField(page, selector, value, label, emit) {
  if (!selector || !value) return false;
  try {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) return false;
    if (!(await loc.isVisible().catch(() => true))) return false;
    await loc.fill(String(value), { timeout: 8000 });
    emit('log', { text: '已填' + label });
    return true;
  } catch (e) {
    emit('log', { text: '填写' + label + '失败: ' + (e.message || e) });
    return false;
  }
}

async function probe(page, sel) {
  return page.evaluate((sel) => {
    let token = '';
    for (const s of sel.split(',')) {
      const el = document.querySelector(s.trim());
      if (el && el.value) { token = el.value; break; }
    }
    const text = document.body ? (document.body.innerText || '') : '';
    const ifr = [...document.querySelectorAll('iframe')].map(f => f.src || '');
    const widgets = document.querySelectorAll('.cf-turnstile, [class*="turnstile"], [id^="cf-chl-widget"], [id*="cf-chl-widget"]').length;
    return {
      token,
      text: text.slice(0, 4000),
      iframes: ifr,
      widgets,
      tokenInputs: document.querySelectorAll(sel.split(',')[0].trim() || '[name="cf-turnstile-response"]').length,
      inputs: document.querySelectorAll('input').length
    };
  }, sel).catch(() => ({ token: '', text: '', iframes: [], widgets: 0, tokenInputs: 0, inputs: 0 }));
}

async function waitToken(page, sel, timeoutMs, emit) {
  const deadline = Date.now() + timeoutMs;
  const started = Date.now();
  let warned = false;
  let sawWidget = false;
  let clicked = false;
  while (Date.now() < deadline) {
    const st = await probe(page, sel);
    if (st.token) { emit('log', { text: '人机验证通过，token 长度 ' + st.token.length }); return { ok: true, token: st.token }; }
    const cap = st.iframes.filter(src => CAPTCHA_IFRAME.test(src));
    if (cap.length || st.widgets > 0 || st.tokenInputs > 0) sawWidget = true;
    const failed = /验证失败|人机验证失败|challenge failed|请完成验证|拖动滑块/i.test(st.text);
    if (!warned && (cap.length || failed)) {
      emit('needman', { text: '需要在弹出的浏览器窗口手动完成人机验证' });
      warned = true;
    }
    if (!clicked && sawWidget && Date.now() - started > 12000) {
      clicked = true;
      emit('log', { text: '尝试自动点击人机验证框' });
      try {
        const frame = page.frames().find(f => /challenges\.cloudflare\.com/.test(f.url()));
        const el = frame && await frame.frameElement().catch(() => null);
        const box = el && await el.boundingBox().catch(() => null);
        if (box) {
          await page.mouse.move(box.x + 25, box.y + box.height / 2, { steps: 8 });
          await page.mouse.click(box.x + 25, box.y + box.height / 2);
          emit('log', { text: '已点击验证框，继续等待' });
        }
      } catch {}
    }
    if (!sawWidget && !warned && Date.now() - started > 15000) {
      emit('log', { text: '页面上没检测到人机验证组件，直接提交' });
      return { ok: true, token: '', skipped: true };
    }
    await sleep(1500);
  }
  return { ok: false };
}

export async function register(opts, emit) {
  const { url, username, password, confirmPassword, mail, timeoutMs } = opts;
  const site = opts.site || resolveSite(url);
  emit('log', { text: '使用站点配置: ' + site.name });
  const ctx = await getContext();
  const page = ctx.pages()[0] || await ctx.newPage();
  const target = site.signupUrl ? site.signupUrl : normUrl(url);

  emit('status', { state: 'opening', text: '打开注册页' });
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    const raw = (e && e.message) ? e.message.split('\n')[0] : String(e);
    const msg = '打不开注册页：' + raw + '（域名解析失败、站点挂了或被拦截，先确认地址能不能在浏览器里打开）';
    emit('needman', { text: msg });
    return { ok: false, message: msg };
  }
  emit('log', { text: '页面已打开: ' + page.url() });

  const firstField = [site.fields.email, site.fields.username, site.fields.password].filter(Boolean).join(', ');
  try { await page.waitForSelector(firstField || 'input', { timeout: 30000 }); }
  catch { emit('log', { text: '没等到表单字段，按现有页面继续' }); }
  await sleep(600);

  emit('status', { state: 'filling', text: '填写表单' });
  if (!(await fillForm(page, site, username, password, confirmPassword, emit))) {
    const msg = '注册页上没找到可填的字段，这个站可能改了结构或只能用第三方账号登录';
    emit('needman', { text: msg });
    emit('status', { state: 'error', text: msg });
    return { ok: false, message: msg };
  }
  emit('shot', {});

  emit('status', { state: 'verifying', text: '等待人机验证' });
  const sel = (site.turnstile && site.turnstile.selector) || '[name="cf-turnstile-response"]';
  let t = await waitToken(page, sel, timeoutMs || 300000, emit);
  emit('shot', {});
  for (let attempt = 1; !t.ok && attempt < 3; attempt++) {
    emit('log', { text: '人机验证未过，刷新页面重试 (' + attempt + '/2)' });
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(800);
    if (!(await fillForm(page, site, username, password, confirmPassword, emit))) break;
    emit('shot', {});
    t = await waitToken(page, sel, 90000, emit);
    emit('shot', {});
  }
  if (!t.ok) {
    const msg = '人机验证多次未通过，请在弹出的浏览器窗口手动完成后重试';
    emit('needman', { text: msg });
    emit('status', { state: 'error', text: msg });
    return { ok: false, message: msg };
  }

  if (opts.dryRun) { emit('status', { state: 'done', text: '演练完成（未提交，未创建账号）' }); return { ok: true, dryRun: true }; }

  emit('status', { state: 'submitting', text: '提交注册' });
  const btn = page.locator(site.submit).first();
  if ((await btn.count()) === 0) {
    const msg = '找不到提交按钮';
    emit('needman', { text: msg });
    return { ok: false, message: msg };
  }
  const respP = site.registerApi
    ? page.waitForResponse(r => site.registerApi.test(r.url()), { timeout: 60000 }).catch(() => null)
    : page.waitForResponse(r => r.request().method() === 'POST', { timeout: 60000 }).catch(() => null);
  const urlBefore = page.url();
  await btn.click();
  const resp = await respP;
  let body = null;
  if (resp) {
    try { body = await resp.json(); } catch { try { body = { raw: (await resp.text()).slice(0, 400) }; } catch {} }
    emit('log', { text: '注册接口 ' + resp.status() + ' ' + JSON.stringify(body).slice(0, 400) });
  } else {
    emit('log', { text: '没捕获到注册接口响应，看页面结果' });
  }
  await sleep(2500);
  emit('shot', {});

  const okFlag = !!(body && (body.success === true || body.ok === true || body.code === 0));
  if (okFlag) {
    emit('status', { state: 'done', text: '注册成功' });
    return { ok: true, body, url: page.url() };
  }
  if (!body && page.url() !== urlBefore && !/sign-?up|register/i.test(page.url())) {
    emit('status', { state: 'done', text: '提交后页面已跳转，可能在等你登录' });
    return { ok: true, redirect: true, url: page.url() };
  }

  const msg = (body && (body.message || body.msg || body.detail)) || '未知结果';
  if (/turnstile|人机验证|验证码|captcha/i.test(msg)) emit('needman', { text: '验证没通过：' + msg });
  if (/关闭|禁用|不允许|第三方|第三方账户|github|oauth/i.test(msg)) emit('needman', { text: msg });
  if (/邮件|邮箱|验证邮件/i.test(msg) && mail && mail.host) {
    emit('status', { state: 'mail', text: '等待验证邮件' });
    const link = await fetchVerificationLink(mail, username, emit);
    if (link) {
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      emit('status', { state: 'done', text: '已访问验证链接' });
      return { ok: true, viaMail: true, url: page.url() };
    }
    const m2 = '没收到验证邮件（IMAP 未配置或超时）';
    emit('status', { state: 'error', text: m2 });
    return { ok: false, message: m2 };
  }
  emit('status', { state: 'error', text: msg });
  return { ok: false, message: msg };
}
