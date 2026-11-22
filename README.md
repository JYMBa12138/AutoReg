# AutoReg 注册控制台

网页控制台 + 本地 Playwright 浏览器：填一个邮箱和密码，选中站点，点一下，
自动打开注册页、填表、等 Cloudflare Turnstile 通过、提交、回显结果与截图。

## 运行

```powershell
node server.js
```

打开 http://127.0.0.1:3123（局域网地址会在启动日志里打印）。
想给公网/其他设备用，见 [DEPLOY.md](DEPLOY.md)；要整套搬到 Linux VPS，见 [DEPLOY-LINUX.md](DEPLOY-LINUX.md)。

## 支持哪些站点

站点配置在 `lib/sites.js`，一条记录 = 一个站：

```js
{
  id: 'xingchiapi',
  name: '星驰 API (xingchiapi.com)',
  match: /xingchiapi\.com/,          // 按网址自动认站
  signupUrl: 'https://.../register?aff=XXX',
  fields: { email: 'input[type="email"], #email', username: '', password: '', confirm: '' },
  submit: 'button:has-text("创建账户"), button[type="submit"]',
  registerApi: /\/api\/v1\/auth\/register/,   // 用来确认提交真的成功；不确定就写 null
  turnstile: { selector: '[name="cf-turnstile-response"]' }
}
```

- `password` / `confirm` 留空时，按页面上 `input[type=password]` 的出现顺序全部填同一个密码（含确认密码），能适配大量没有 name 属性的 SPA。界面只要求填一次密码。
- 邮箱和用户名分开填：`email` 必填，`username` 可选（留空取邮箱前缀）；`fields.username` 留空时用通用选择器探测，探测到的框与邮箱框是同一个就跳过，不会把邮箱重复填进用户名。
- `registerApi` 写 null 时改成「等任意 POST」，再靠页面跳转判断是否成功。
- 界面里也能选「通用」，不套站点配置，全靠上面这些兜底选择器现场探测。

## 浏览器模式

| 模式 | 怎么开 | 说明 |
| --- | --- | --- |
| 有头（默认，推荐） | 直接 `node server.js` | 拉起真实 Chrome/Edge 窗口，Turnstile 基本自动过；需要人工时窗口就在那儿，点一下即可 |
| 无头 | `$env:BROWSER_HEADLESS=1` | 不弹窗口，但对全新配置目录 Cloudflare 会给交互式验证并且拒绝程序化点击；只适合已积累信任的 profile |

其他环境变量：`CHROME_PATH` / `CHROMIUM_PATH`（指定浏览器可执行文件）、`CDP_PORT`（有头模式调试端口，默认 9333）、`HOST`（监听地址，默认 0.0.0.0）、`ACCESS_TOKEN`（访问口令，见下）。

## 访问口令

本机自用可以不设。挂到公网务必设：

```powershell
$env:ACCESS_TOKEN='一串够长的口令'
node server.js
```

设了之后页面会跳 `/login.html` 要口令，通过后发 30 天 cookie；脚本调用可带 `x-access-token: <口令>` 头。

## 说明

- 注册页强制 Turnstile。脚本会等 token、必要时刷新重试一次，仍不过就把提示打回控制台页面让你手动点。
- 演练模式只填表 + 等 token，不点提交、不建账号。
- 邮件 IMAP/SMTP 配置区预留：目标站要求邮件验证时才会用到，目前用的两个站都不需要。
- 浏览器配置目录持久化在 `data/profile`（有头/CDP 模式是 `data/cdp-profile`），登录态保留；截图在 `data/last.png`。

## 不做的事

- 不伪造、不购买、不代解 Turnstile token。
- 不做批量注册流水线。目标站公告明确在排查脚本账号与刷邀请行为。
