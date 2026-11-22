// 站点配置表。每站一个对象；resolveSite() 用 url 或 id 匹配。
export const sites = [
  {
    id: 'xingchiapi',
    name: '星驰 API 公益站 (xingchiapi.com)',
    match: /xingchiapi\.com/,
    signupUrl: 'https://xingchiapi.com/register?aff=YEBlQMo6DFM25',
    fields: {
      email: 'input[type="email"], #email',
      username: '',
      password: '',
      confirm: ''
    },
    submit: 'button:has-text("创建账户"), button[type="submit"]',
    registerApi: /\/api\/v1\/auth\/register/,
    turnstile: { selector: '[name="cf-turnstile-response"]' }
  },
  {
    id: 'sylu',
    name: '启源星 (chuan.sylu.cc)',
    match: /chuan\.sylu\.cc/,
    signupUrl: 'https://chuan.sylu.cc/sign-up?aff=UpsG',
    fields: {
      email: 'input[type="email"], input[name="email"], #email',
      username: 'input[name="username"], #username',
      password: '',
      confirm: ''
    },
    submit: 'button:has-text("创建账户"), button:has-text("注册"), button[type="submit"]',
    registerApi: /\/api\/user\/register/,
    turnstile: { selector: '[name="cf-turnstile-response"]' }
  }
];

export const defaultSite = {
  id: 'generic',
  name: '通用（按选择器探测）',
  fields: {
    email: 'input[type="email"], input[name="email"], #email',
    username: 'input[name="username"], #username, input[name="user"]',
    password: '',
    confirm: ''
  },
  submit: 'button[type="submit"], button:has-text("注册"), button:has-text("创建账户"), button:has-text("提交")',
  registerApi: null,
  turnstile: { selector: '[name="cf-turnstile-response"], [name="g-recaptcha-response"], [name="h-captcha-response"]' }
};

export function resolveSite(urlOrId) {
  if (!urlOrId) return defaultSite;
  const s = String(urlOrId).trim();
  const byId = sites.find(x => x.id === s);
  if (byId) return byId;
  const byUrl = sites.find(x => x.match && x.match.test(s));
  if (byUrl) return byUrl;
  return defaultSite;
}

export function listSites() {
  return sites.map(s => ({
    id: s.id, name: s.name, signupUrl: s.signupUrl || '',
    // match 是正则，取源串里的域名片段给前端做「地址变了自动选站」
    host: String(s.match && s.match.source || '').replace(/\\/g, '').split('|')[0]
  }));
}
