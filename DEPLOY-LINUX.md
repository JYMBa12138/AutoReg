# Linux VPS 一键部署（整套：Node + Chromium + Xvfb + PM2）

适用：你有 root 的 Debian/Ubuntu 云服务器（VPS），想把整套服务（网页 + 真浏览器）装上去。
不适用：共享虚拟主机 / 只有 PHP 的建站空间。

## 原理

无头模式已被 Cloudflare 挡住（新环境一定弹交互式验证，程序点击无效）。
所以用 Xvfb 虚拟显示让真实的 Chromium 以「有头」方式运行，等价于有一块虚拟屏幕。

## 步骤

    # 1. 上传整个项目到 VPS（git clone 或 scp 都行）
    # 2. 设置访问口令
    export ACCESS_TOKEN='换成你自己的长口令'
    # 3. 一键安装并启动
    bash deploy-linux.sh

脚本会：装 Chromium + Xvfb + 中文字体 + Node 22，装依赖，用 PM2 常驻并开机自启。
启动后本机 http://127.0.0.1:3123 可访问。

## 外网访问

再加一条隧道（见 DEPLOY.md 第 3/4 节）：

    cloudflared tunnel --url http://127.0.0.1:3123

## Docker 方式（可选）

    docker build -t autoreg .
    docker run -d -p 3123:3123 -e ACCESS_TOKEN='你的口令' autoreg

## 必须先自测（关键）

装好后不要直接拿真账号试。先打开页面、勾「演练模式」跑一次，看日志是否出现「人机验证通过，token 长度 xxx」：

- 出现 token → 这个 VPS 的 IP + 环境被 Cloudflare 放过，可以正常用。
- 反复「人机验证未过 / 请在浏览器窗口手动完成」且无 token → 该数据中心 IP 被重点风控，这个 VPS 用不了，换 IP 或回到「自家 Windows 常开 + 隧道」方案。

VPS 的数据中心 IP + 无 GPU + Xvfb 是 Cloudflare 最容易怀疑的组合，过不过取决于 IP 信誉，不能提前保证。
这台 Windows 实测是有头 + 家庭/办公 IP 能过，所以最稳的仍是方案 A。