# Core image for SILI
# 因为官方 Node.js 镜像缺少太多我们需要的工具，我们基于 Ubuntu 22.04 制作了自己的基础镜像

FROM ubuntu:22.04

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Ubuntu 22.04
RUN sed -i 's/archive.ubuntu.com/mirrors.aliyun.com/g' /etc/apt/sources.list \
    && sed -i 's/security.ubuntu.com/mirrors.aliyun.com/g' /etc/apt/sources.list
# Ubuntu 24.04
# RUN set -i 's/archive.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list.d/ubuntu.sources
#     && sed -i 's/security.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list.d/ubuntu.sources
RUN apt update

# 安装常用工具和软件包
RUN apt install -y \
    wget \
    curl \
    gnupg \
    zip \
    unzip \
    p7zip-full \
    git \
    fontconfig \
    --fix-missing

# 安装中文字体
# 汉仪文黑
RUN wget https://r2.epb.wiki/fonts/HYWenHei.7z \
    && 7z x HYWenHei.7z -oHYWenHei \
    && mv HYWenHei/*.ttf /usr/share/fonts/truetype/ \
    && rm HYWenHei.7z
# Segoe UI Emoji
RUN wget https://r2.epb.wiki/fonts/seguiemj.ttf \
    && mv seguiemj.ttf /usr/share/fonts/truetype/
RUN fc-cache -fv

# 安装 Node.js LTS 以及 pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh \
    && chmod +x nodesource_setup.sh \
    && bash nodesource_setup.sh \
    && apt install -y nodejs \
    && npm install -g pnpm

# 安装 Node.js 依赖
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# 安装 Chrome
# https://pptr.nodejs.cn/guides/configuration
# RUN pnpm dlx puppeteer browsers install
# 我们的项目依赖本身就包含了 puppeteer，所以我们不需要 dlx 浪费时间
RUN pnpm puppeteer browsers install
# https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/dist_package_versions.json
RUN apt install -y libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libudev1 libuuid1 libx11-6 libx11-xcb1 libxcb-dri3-0 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 libxrender1 libxshmfence1 libxss1 libxtst6

# SILI，启动！
CMD ["pnpm", "start"]
