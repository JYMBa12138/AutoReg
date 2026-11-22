#!/usr/bin/env bash
# AutoReg 一键部署到 Linux VPS（Debian/Ubuntu）。
# 用法：在 VPS 上（root）执行  bash deploy-linux.sh
# 作用：装 Node 22 + Chromium + Xvfb + 依赖，用 Xvfb 提供虚拟显示，
#       让真实 Chromium 以「有头」方式跑起来过 Turnstile，PM2 常驻。
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "== 1. 安装系统依赖 =="
apt-get update -y
apt-get install -y curl xvfb chromium fonts-noto-cjk   libnss3 libatk-bridge2.0-0 libxcomposite1 libxrandr2   libgbm1 libasound2 libxdamage1 libxkbcommon0 libgtk-3-0

if ! command -v node >/dev/null 2>&1; then
  echo "== 2. 安装 Node.js 22 =="
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "== 3. 安装项目依赖（跳过 Playwright 自带浏览器下载）=="
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --omit=dev

echo "== 4. 安装 PM2 =="
npm install -g pm2

# 需要你自己设一个够长的口令
if [ -z "${ACCESS_TOKEN:-}" ]; then
  echo "请在运行前设置访问口令：export ACCESS_TOKEN='你的长口令'"
  exit 1
fi

echo "== 5. 用 PM2 + Xvfb 启动（真实 Chromium 有头模式）=="
# xvfb-run 提供 DISPLAY；CHROMIUM_PATH 指向系统 Chromium；BROWSER_HEADLESS 不设（=有头）
cat > ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [{
    name: 'autoreg',
    script: 'xvfb-run',
    args: ['-a', '-s', '-screen 0 1280x900x24', 'node', 'server.js'],
    env: {
      CHROMIUM_PATH: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      HOST: '0.0.0.0',
      ACCESS_TOKEN: process.env.ACCESS_TOKEN || ''
    },
    max_restarts: 5,
    autorestart: true
  }]
};
EOF
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root | grep -v '^$' || true

echo ""
echo "完成。本机访问 http://127.0.0.1:3123"
echo "外网访问还需一条隧道（cloudflared / frp），见 DEPLOY.md 第 3、4 节。"
echo "自测验证是否真能过 Turnstile：打开页面选「演练模式」跑一次，看日志有没有 token。"
