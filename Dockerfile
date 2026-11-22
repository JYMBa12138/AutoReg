FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1     CHROMIUM_PATH=/usr/bin/chromium     HOST=0.0.0.0     DISPLAY=:99

RUN apt-get update && apt-get install -y --no-install-recommends     chromium xvfb fonts-noto-cjk     libnss3 libatk-bridge2.0-0 libxcomposite1 libxrandr2     libgbm1 libasound2 libxdamage1 libxkbcommon0 libgtk-3-0     && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3123
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x900x24 & node server.js"]
