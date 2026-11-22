# 安卓 APP（一键注册）

把「填邮箱 + 密码 → 自动填表 → 等 Turnstile → 提交」搬到手机里。
手机跑的是真实 WebView 内核 + 你自己的移动/家庭 IP，比服务器无头更容易过 Cloudflare。

## 它怎么工作

1. 你在 APP 里填邮箱、密码、确认密码，选站点，点「开始注册」。
2. APP 用 WebView 打开该站注册页（真实浏览器内核，带你的 IP 与 Cookie）。
3. 页面加载完，APP 注入一段 JS：
   - 自动填邮箱 / 密码 / 确认密码（密码框按 `input[type=password]` 顺序填，兼容没有 name 的站点）
   - 轮询隐藏域 `[name="cf-turnstile-response"]` 等 token
   - 拿到 token 后点页面上的「创建账户」按钮，让站点自己的前端发请求
   - 监听成功 / 失败文案并回报到顶部状态栏
4. 若出现「请验证您是真人」复选框，**在下方网页里点一下**，token 会自己写进去，流程继续。

## 目录

- `app/src/main/java/com/autoreg/app/MainActivity.kt` — WebView 宿主、表单、桥接
- `app/src/main/java/com/autoreg/app/InjectJs.kt` — 注入页面的自动化脚本
- `app/src/main/res/layout/activity_main.xml` — 界面
- `build-local.ps1` — Windows 本机自动装 SDK 并打包
- `.github/workflows/build-apk.yml` — 推到 GitHub 后自动出 APK

## 三种拿 APK 的方式

### 1. GitHub Actions（推荐，零成本）

推到 GitHub 后，Actions 会自动跑 `build-apk`，在运行记录页面底部下载 `autoReg-debug-apk` 产物。
也可以手动触发：Actions → build-apk → Run workflow。

### 2. 本机脚本（已内置）

    powershell -ExecutionPolicy Bypass -File android-app/build-local.ps1

脚本会下载 Android SDK 命令行工具、platform-34、build-tools 34 和 Gradle 8.7，然后输出：
`android-app/app/build/outputs/apk/debug/app-debug.apk`

### 3. Android Studio

打开 `android-app` 目录，等 Gradle 同步完，Build → Build APK(s)。

## 装到手机

1. 把 `app-debug.apk` 传到手机（微信文件传输 / 数据线 / 网盘都行）。
2. 点安装，允许「未知来源」。
3. 打开 APP，填邮箱密码，点开始注册。

debug 包签名是自动生成的，能直接装。要长期分发就自己生成 keystore 打 release 包。

## 限制（必须知道）

- **不能上架 Google Play / 国内应用商店**：自动注册工具违反商店政策。只能侧载，自己用或小范围发。
- 每台手机独立跑，不共享登录态。
- 部分站点在 WebView 里 Turnstile 会弹图片题，需要手动点；点完流程会自动继续。
- 站点如果关了密码注册（比如 chuan.sylu.cc 现在就是关的），APP 也救不了，会显示站点返回的失败原因。
- 密码只存在内存和输入框里，不写文件、不上传。

## 换站点

APP 里内置了「星驰 API」「启源星」两条，也可以选「自定义地址」自己填注册页 URL。
填表逻辑是通用的（按 type=email / type=password / 按钮文案匹配），不用改代码。
