# Core image for SILI
# 因为官方 Node.js 镜像缺少太多我们需要的工具，我们基于 Ubuntu 22.04 制作了自己的基础镜像

FROM ubuntu:22.04

WORKDIR /app

RUN sed -i 's/archive.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list \
    && sed -i 's/security.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list
# RUN set -i 's/archive.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list.d/ubuntu.sources
#     && sed -i 's/security.ubuntu.com/mirrors.cloud.tencent.com/g' /etc/apt/sources.list.d/ubuntu.sources
ENV DEBIAN_FRONTEND=noninteractive
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

# 安装 Chromium 浏览器
RUN apt install -y \
    chromium-browser \
    chromium-codecs-ffmpeg-extra \
    --fix-missing

# 安装 core 依赖
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# SILI，启动！
CMD ["pnpm", "start"]
