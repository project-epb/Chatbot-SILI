# Core image for SILI
# 因为官方 Node.js 镜像缺少太多我们需要的工具，我们基于 Ubuntu 22.04 制作了自己的基础镜像

FROM ubuntu:22.04

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Ubuntu 22.04
RUN sed -i 's/archive.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list \
    && sed -i 's/security.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list
# Ubuntu 24.04
# RUN set -i 's/archive.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list.d/ubuntu.sources
#     && sed -i 's/security.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list.d/ubuntu.sources
RUN apt update

# 安装常用工具和软件包
# 有一说一，我也不清楚哪些是必要的，索性先全装上再说 =v=
RUN apt install -y \
    wget \
    curl \
    gnupg \
    zip \
    unzip \
    p7zip-full \
    git \
    cmake \
    libpng-dev libjpeg-dev libtiff-dev libwebp-dev libopenjp2-7-dev \
    --fix-missing

# 安装中文字体
RUN apt install -y \
    fonts-noto-cjk fonts-wqy-zenhei fonts-wqy-microhei \
    # language-pack-zh-hans language-pack-zh-hans-base \
    # locales \
    --fix-missing

# 安装 Node.js LTS 以及 pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x -o nodesource_setup.sh \
    && chmod +x nodesource_setup.sh \
    && bash nodesource_setup.sh \
    && apt install -y nodejs \
    && npm install -g pnpm

# 安装 Chromium
# RUN apt install -y snapd
# RUN snap install chromium
# https://askubuntu.com/questions/1204571/how-to-install-chromium-without-snap
# COPY ./data/core/debian.list /etc/apt/sources.list.d/debian.list
# COPY ./data/core/chromium.pref /etc/apt/preferences.d/chromium.pref
# RUN apt-key adv --keyserver keyserver.ubuntu.com --recv-keys DCC9EFBF77E11517 \
#     && apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 648ACFD622F3D138 \
#     && apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 112695A0E562B32A \
#     && apt-key export 77E11517 | gpg --dearmour -o /usr/share/keyrings/debian-buster.gpg \
#     && apt-key export 22F3D138 | gpg --dearmour -o /usr/share/keyrings/debian-buster-updates.gpg \
#     && apt-key export E562B32A | gpg --dearmour -o /usr/share/keyrings/debian-security-buster.gpg
# RUN apt update
# RUN apt install -y chromium

# 安装 Node.js 依赖
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# 安装 Chromium
# FIXME: 这样安装 Chromium 有点傻逼，但暂时没找到更好的办法，TMD服了
RUN node node_modules/puppeteer/install.mjs
RUN apt install -y libnss3 libatk-bridge2.0-0 libxkbcommon0 libgtk-3-0 libxcomposite1 libxrandr2 libgbm1 libasound2 libpulse0 libxss1 libxtst6

# SILI，启动！
CMD ["pnpm", "start"]
