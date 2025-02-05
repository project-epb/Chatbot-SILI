# SILI 开发文档

这个文档主要是开发者写给自己看的备忘录，阅读此文档不一定能够让你在自己的服务器上成功部署 SILI。

## 指令速查

**启动服务**

```sh
docker-compose -p sili up -d
```

**停止服务**

```sh
docker-compose -p sili down
```

**重新构建**

```sh
docker-compose -p sili up -d --build
```

## 容器大纲

SILI 服务是基于 Docker 容器的，因此需要安装 Docker 以及 Docker Compose。

### sili-core

使用 [sili-core.dockerfile](../docker/sili-core.dockerfile) 构建。

基于 Ubuntu 22.04 镜像，安装了 Node.js LTS 和 pnpm。

额外安装了一个 chromium 浏览器，用于 Puppeteer 的运行。