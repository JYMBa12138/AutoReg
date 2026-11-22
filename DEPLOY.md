# AutoReg 部署到公网域名指南（零成本）

本文档说明如何把本地的 AutoReg 注册控制台（Node.js + Playwright）暴露到自己的域名上，让人在任何地方都能打开网页使用。全程不花一分钱，前提是一台常开机的 Windows 机器。

> 适用版本：package.json 里的 autoreg-console（Express + Playwright）。
> 服务入口：server.js，默认监听 0.0.0.0:3123，前端静态页在 public/index.html。
> 本文只讲部署与网络，不改任何 .js / .html 代码。

---

## 1. 前置条件

- 一台常开的 Windows 机器（睡眠/休眠要关掉，否则外网访问会中断）。
- 已安装 Microsoft Edge 或 Google Chrome（有头模式要弹出真实浏览器窗口）。
- Node.js 可执行文件路径（本项目专用，已内置依赖）：

    $NODE = "D:\wendang\deepseek-harness\default-workspace\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

- 项目目录：

    $DIR = "D:\aaaaaaaaaaaaaaaaaaaa\AutoReg"
    Set-Location $DIR

验证依赖已装好（存在 node_modules，含 express / playwright / imapflow / mailparser）：

    Test-Path "$DIR\node_modules\express"; Test-Path "$DIR\node_modules\playwright"

两条都返回 True 即可。

---

## 2. 两种浏览器模式

浏览器由 lib/browser.js 启动，负责打开目标注册页、填表、过验证后提交。

### 2.1 有头模式（默认，推荐）

默认不设 BROWSER_HEADLESS，服务会 spawn 一个真实 Edge/Chrome，并用 CDP（Chrome DevTools Protocol）连上去，CDP 默认端口 9333（可用 CDP_PORT 改）。弹出的浏览器窗口就是真实浏览器，Cloudflare Turnstile 等人机验证更容易由你手动通过。

启动：

    $NODE = "D:\wendang\deepseek-harness\default-workspace\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    Set-Location "D:\aaaaaaaaaaaaaaaaaaaa\AutoReg"
    & $NODE server.js

### 2.2 无头模式

设置环境变量 BROWSER_HEADLESS=1 后，走 Playwright 持久化上下文 + 指纹伪装（抹 navigator.webdriver、伪装 chrome 对象、真实 UA、--disable-blink-features=AutomationControlled）。省资源，但更可能遇到 Cloudflare 交互式验证，验证环节成功率低于有头。

启动（PowerShell 里当前进程设置环境变量）：

    $env:BROWSER_HEADLESS = "1"
    $NODE = "D:\wendang\deepseek-harness\default-workspace\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    Set-Location "D:\aaaaaaaaaaaaaaaaaaaa\AutoReg"
    & $NODE server.js

说明：无头模式下浏览器配置目录持久化在 data\profile，登录态会保留。

---

## 3. 方案 A：cloudflared Quick Tunnel（临时试用，最简单）

不需要域名、不需要登录 Cloudflare 账号，cloudflared 会分配一个随机的 *.trycloudflare.com 域名。**该域名每次重启都会变**，只适合临时试用。

1. 下载 cloudflared（Windows 用 exe）：

   https://github.com/cloudflare/cloudflared/releases

   下载 cloudflared-windows-amd64.exe，放到一个固定目录，例如：

    $CF = "D:\tools\cloudflared.exe"

2. 先启动本服务（见第 2 节，保持窗口开着）。

3. 另开一个 PowerShell 窗口，跑：

    & "D:\tools\cloudflared.exe" tunnel --url http://127.0.0.1:3123

4. 终端里会打印类似：

    https://random-words-123.trycloudflare.com

   用这个网址即可从公网访问。重启 cloudflared 后网址会变，需要重新把新网址告诉使用者。

---

## 4. 方案 B：自己的域名 + cloudflared Named Tunnel（稳定，推荐）

适合长期使用。前提：**域名托管在 Cloudflare**（把域名的 NS 改到 Cloudflare，免费套餐即可，不用开任何付费功能）。

### 4.1 一次性准备

    $CF = "D:\tools\cloudflared.exe"

    # 1) 登录 Cloudflare（会弹出浏览器让你授权）
    & $CF tunnel login

    # 2) 创建一条命名隧道，记下返回的隧道 ID 和隧道名
    & $CF tunnel create autoreg

tunnel create autoreg 会生成 ~/.cloudflared/<TUNNEL_ID>.json（Windows 上是 C:\Users\<你>\.cloudflared\<TUNNEL_ID>.json），这是隧道的身份凭据，别丢、别外泄。

### 4.2 把域名指到隧道

假设你的域名是 example.com，想让子域名 reg.example.com 指向本服务：

    # 创建 DNS 记录（会自动在 Cloudflare 加一条 CNAME：reg.example.com -> <TUNNEL_ID>.cfargotunnel.com）
    & $CF tunnel route dns autoreg reg.example.com

### 4.3 config.yml 方式运行（推荐用于服务化）

在项目目录建一个 cloudflared-config.yml（放哪都行，这里放项目目录，路径要写全）：

    # D:\aaaaaaaaaaaaaaaaaaaa\AutoReg\cloudflared-config.yml
    tunnel: <TUNNEL_ID>          # 换成第 4.1 步返回的隧道 ID
    credentials-file: C:\Users\<你>\.cloudflared\<TUNNEL_ID>.json   # 换成实际路径

    ingress:
      - hostname: reg.example.com   # 换成你的域名
        service: http://127.0.0.1:3123
      - service: http_status:404

运行：

    & "D:\tools\cloudflared.exe" tunnel --config "D:\aaaaaaaaaaaaaaaaaaaa\AutoReg\cloudflared-config.yml" run autoreg

之后把这条命令和 node server.js 都做成常驻服务（见第 7 节）。配置里已有 tunnel 名时，run 后面的 autoreg 也可省略。

> 说明：cloudflared 会自动提供 HTTPS（Cloudflare 边缘证书），你的本机不需要申请证书。到 reg.example.com 时用户看到的是受信任的 HTTPS。

---

## 5. 方案 C：Caddy 或 Nginx 反向代理（自己有公网 IP / 端口映射）

如果你有固定公网 IP（或在路由器/云主机上做了端口映射到这台 Windows），可以用 Caddy 或 Nginx 反代。**关键点：本服务用了 SSE（/api/events，前端 EventSource 长连接），反代必须关闭缓冲**，否则日志、状态、截图刷新会卡住或断流。

### 5.1 Caddyfile

    reg.example.com {
        reverse_proxy 127.0.0.1:3123 {
            flush_interval -1
        }
    }

Caddy 默认对 SSE 是流式友好的；flush_interval -1 表示不缓冲、立即转发，是最稳的写法。Caddy 也会自动申请和续期 HTTPS 证书（需要域名能解析到本机公网 IP）。

### 5.2 nginx.conf 片段

    server {
        listen 80;
        server_name reg.example.com;

        location / {
            proxy_pass http://127.0.0.1:3123;

            # SSE 关键：关缓冲，否则 /api/events 会被攒着不吐给前端
            proxy_buffering off;
            proxy_cache off;

            # 让上游和反向代理层都不缓冲
            proxy_set_header X-Accel-Buffering no;

            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            # SSE 长连接超时放宽
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }
    }

要点：

- proxy_buffering off; —— nginx 不缓冲上游响应。
- proxy_set_header X-Accel-Buffering no; —— 通知上游/代理链不缓冲（配合 Caddy/Cloudflare 等中间层）。
- proxy_http_version 1.1; + 空 Connection —— SSE 是 HTTP/1.1 长连接必需。
- proxy_read_timeout 放宽 —— 否则长连接闲置会被 nginx 掐断。

HTTPS 证书可用 certbot（Let's Encrypt）免费申请，或继续由 Cloudflare 代理边缘提供证书。

---

## 6. 安全提示（重要）

默认不带访问口令（本机自用没问题）。一旦挂到公网，**必须**设一个 `ACCESS_TOKEN` —— 服务内置了口令门禁，设了之后所有人先看到 /login.html 输入口令，输对了拿 30 天有效期的 cookie。

不设口令时，任何人拿到网址就能：

- 打开控制台、发注册任务（POST /api/register）。
- 关掉你的浏览器上下文（POST /api/shutdown）。

敏感接口：

| 接口 | 方法 | 作用 | 风险 |
| --- | --- | --- | --- |
| /api/register | POST | 发起自动注册任务 | 陌生人可触发注册/消耗你机器资源 |
| /api/shutdown | POST | 关闭浏览器上下文 | 陌生人可打断正在进行的任务 |
| /api/events | GET | SSE 实时日志/状态/截图通知 | 泄露运行日志 |
| /api/state | GET | 返回状态、日志、运行标志 | 同上 |
| /api/sites | GET | 列出站点配置 | 暴露你配置的站点信息 |
| /api/shot | GET | 返回最近截图 | 泄露浏览器画面 |

建议按顺序叠加（至少做第 1 条）：

0. **内置口令（最简单，改一行环境变量）**：启动前设 `$env:ACCESS_TOKEN='自己定一串够长的口令'` 再 `node server.js`。

    ```powershell
    $env:ACCESS_TOKEN='换成你自己的长口令'
    node server.js
    ```

    启动日志会打印「已启用访问口令」。API 也认 `x-access-token: <口令>` 请求头（给脚本用）。

1. cloudflared Access（Zero Trust 免费版）：在 Cloudflare Zero Trust 控制台给 reg.example.com 加一条 Access Policy，用邮箱验证码 / Google / GitHub 等登录后再放行，服务本身完全不用改。这是配合方案 B 最省事的做法。
2. Caddy basic_auth：在 Caddyfile 反代前加一道 HTTP Basic 口令：

    reg.example.com {
        basic_auth {
            admin $2a$14$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        }
        reverse_proxy 127.0.0.1:3123 {
            flush_interval -1
        }
    }

   密码哈希用 caddy hash-password 生成。

3. 前置一层口令：在反代/隧道前再加一个带口令的页面或网关。不要直接裸奔公网。

> 即使加了鉴权，也建议把 0.0.0.0 监听理解为「局域网可达」；真正暴露到公网时务必套 Access 或 Basic Auth。

---

## 7. 常驻运行：Windows 服务 / 计划任务

命令行直接跑 node server.js 一关窗口就停。要常驻，用 nssm 或计划任务。

### 7.1 用 nssm 注册为 Windows 服务（推荐）

1. 下载 nssm：https://nssm.cc/download ，解压出 nssm.exe（放 D:\tools\nssm.exe）。

2. 注册服务（有头模式）：

    $NSSM = "D:\tools\nssm.exe"
    $NODE = "D:\wendang\deepseek-harness\default-workspace\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    $DIR  = "D:\aaaaaaaaaaaaaaaaaaaa\AutoReg"

    & $NSSM install AutoReg $NODE "server.js"
    & $NSSM set AutoReg AppDirectory $DIR
    & $NSSM set AutoReg AppStdout "$DIR\data\autoreg.out.log"
    & $NSSM set AutoReg AppStderr "$DIR\data\autoreg.err.log"
    & $NSSM set AutoReg AppRotateFiles 1
    & $NSSM set AutoReg AppRotateBytes 10485760
    & $NSSM set AutoReg Start SERVICE_AUTO_START
    & $NSSM start AutoReg

3. 无头模式再加一条环境变量：

    & $NSSM set AutoReg AppEnvironmentExtra "BROWSER_HEADLESS=1"
    & $NSSM restart AutoReg

4. 需要指定浏览器路径时：

    & $NSSM set AutoReg AppEnvironmentExtra "CHROME_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    & $NSSM restart AutoReg

> 注意：Windows 服务默认在「会话 0」运行，**有头浏览器窗口可能不可见**；如果必须看到弹出的浏览器来点验证，建议改用下面的「计划任务 + 当前用户 + 交互」方式。

### 7.2 用计划任务（保留桌面交互，适合有头模式）

有头模式要「人看得到浏览器窗口」，用计划任务以当前登录用户运行更合适：

    $NODE = "D:\wendang\deepseek-harness\default-workspace\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    $DIR  = "D:\aaaaaaaaaaaaaaaaaaaa\AutoReg"

    $action    = New-ScheduledTaskAction -Execute $NODE -Argument 'server.js' -WorkingDirectory $DIR
    $trigger   = New-ScheduledTaskTrigger -AtStartup
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask -TaskName "AutoReg" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "AutoReg 注册控制台常驻"
    Start-ScheduledTask -TaskName "AutoReg"

无头 + 常驻更建议用第 7.1 节的 nssm 方式，环境变量配置清晰。

配套：cloudflared 也用 nssm 注册（把 cloudflared tunnel --config ... run 的完整命令写进去），保证隧道和本服务一起常驻。

---

## 8. 排错清单

### 8.1 端口 3123 被占用

    netstat -ano | Select-String ":3123"

看到 PID 后结束它，或换端口启动：$env:PORT = "3124"; & $NODE server.js（换端口后隧道/反代里的 3123 也要同步改）。

### 8.2 防火墙放行 3123

本机访问没问题但局域网/外网访问不到，先放行（只对方案 C 的自有公网 IP 有意义；方案 A/B 走 cloudflared 出站隧道，**不需要**放行入站端口）：

    New-NetFirewallRule -DisplayName "AutoReg 3123" -Direction Inbound -Protocol TCP -LocalPort 3123 -Action Allow

验证规则：

    Get-NetFirewallRule -DisplayName "AutoReg 3123" | Format-List DisplayName,Enabled,Direction,Action

### 8.3 CDP 9333 被占用

有头模式用 CDP 连浏览器，端口默认 9333。若被占：

    netstat -ano | Select-String ":9333"

处理：结束占用进程，或换端口启动 $env:CDP_PORT = "9334"; & $NODE server.js。

### 8.4 浏览器找不到

服务报「找不到 Chrome/Chromium，请设置环境变量 CHROME_PATH 或 CHROMIUM_PATH」。设置：

    $env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    & $NODE server.js

内置候选路径（按顺序）是 Chrome 各安装位、Edge 各安装位，装到了非默认位置就用 CHROME_PATH 指定。

### 8.5 cloudflared 证书过期 / 登录失效

- tunnel run 报证书/鉴权错误：重新跑 cloudflared tunnel login 刷新授权；确认 credentials-file 路径正确、config.yml 里的 tunnel ID 与 tunnel create 返回一致。
- quick tunnel 域名失效：正常现象，重启后换新域名。
- 域名打不开：确认 DNS 记录由 tunnel route dns 建好（Cloudflare 控制台 DNS 页能看到那条 CNAME），且域名 NS 已托管到 Cloudflare。

### 8.6 SSE 断流 / 页面日志不更新

- 走了 nginx 却卡住：确认第 5.2 节三条 proxy_buffering off;、X-Accel-Buffering no、proxy_http_version 1.1; 都写了。
- 走了 Caddy：加 flush_interval -1。
- 长时间无消息被切断：检查反代 proxy_read_timeout（nginx）或隧道/负载均衡的 idle timeout，放长到 3600s。

### 8.7 服务起不来 / 立即退出

先看日志（nssm 方式）：

    Get-Content "D:\aaaaaaaaaaaaaaaaaaaa\AutoReg\data\autoreg.err.log" -Tail 50

常见原因：node_modules 没装（先跑 & $NODE server.js 看报错）、路径含空格没加引号、Node 路径写错。

---

## 附：常用命令速查

    # 定义路径（每次新窗口都要先跑这段）
    $NODE = "D:\wendang\deepseek-harness\default-workspace\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    $DIR  = "D:\aaaaaaaaaaaaaaaaaaaa\AutoReg"
    $CF   = "D:\tools\cloudflared.exe"

    # 有头启动
    Set-Location $DIR; & $NODE server.js

    # 无头启动
    $env:BROWSER_HEADLESS = "1"; Set-Location $DIR; & $NODE server.js

    # 快速隧道
    & $CF tunnel --url http://127.0.0.1:3123

    # 命名隧道
    & $CF tunnel --config "$DIR\cloudflared-config.yml" run autoreg
