<div align="center">

<img src="https://i.loli.net/2021/02/19/nPzM8qvmyGBI2aL.jpg" alt="SILI t2020 avatar.jpg" title="SILI t2020 avatar.jpg" width="200"/>

# Chatbot SILI [v4.0]

**🚧🚧🚧 开发版 🚧🚧🚧**<br>注意：这是正在开发中的 SILI 4.0，并非所有 v3 的功能均可使用

</div>

万界规划局聊天机器人，主要用于处理 Fandom 官方 QQ 群 ↔ Discord 的消息推送，也附带一些好玩的功能。

名字 SILI，来自作者的原创角色 [苏凛栎](https://epbureau.fandom.com/wiki/苏凛栎)，是一个人工智能小萝莉、一个笨蛋。

## Fandom 中文社区中心

- QQ 群: https://community.fandom.com/zh/index.php?curid=3399
- Discord: https://discord.gg/kK5Ttan

能够实现 QQ 群 ↔ Discord 的双向消息推送。

## 常用指令

可以通过 `@SILI <command>` `sili，<command>` 或者 `!<command>` 使用 SILI 的指令。不过许多指令带有别名和容易记住的中文捷径。

全部指令以及使用说明可以通过`!help -a`获取。

### `wiki <pagename>`

使用频道绑定的 MediaWiki 网站返回 wiki 的页面信息与链接。

例如 `[[Help:Content]]` → https://community.fandom.com/zh/wiki/Help:Content

Fandom 的全域跨语言链接同样适用，例如 `[[w:c:zh.ngnl:初濑伊纲]]` → https://ngnl.fandom.com/zh/wiki/%E5%88%9D%E6%BF%91%E4%BC%8A%E7%BA%B2

### `genshin`

查询《原神》玩家信息。

- `我的原神信息` 展示你的游戏信息卡
- `原神角色xxx` 炫耀你的角色
- `原神深渊` 查看深境螺旋通关情况

### `fandom-community-search`

通过小鱼君编写的~~废物~~爬虫爬取 https://community-search.fandom.com 的数据，返回指定关键词的搜索结果。

`!fandom-community-search <关键词> --lang [语言代码] --nth [第几个结果]`

- **关键词** 就是搜索的关键词，如果有空格则需要用引号包裹起来，例如`"Minecraft Wiki`
- **语言代码** 预设搜索中文`zh`，语言代码与 MediaWiki 软件设定一致
- **第几个结果** 预设显示第一个结果，必须是 1-10 的数字，否则显示第一个

范例：`!fms 游戏人生 -l zh`

### `youdao`

使用无道词典进行翻译，支持超过一百种语言互译！

- 极简自动翻译：`sili，hello world是什么意思`
- 快速中外翻译：`sili，你好用埃塞俄比亚语怎么说`
- 指定语言互译：`sili，英语hello world用日语怎么说`

### `pixiv`

快速查看 P 站插画！

`!p站插画 123456`

### `bilibili`

查询 b 站用户，一键单推主播！

- 查用户：`查b站用户xxx`
- 查直播间：`查b站xxx的直播间`
- 直播间订阅：`单推b站主播xxx`

### `inpageedit-search [sitename]`

通过 Wjghj API 查询 [InPageEdit Analysis](https://blog.wjghj.cn/inpageedit-v2/analysis/) 的统计数据。

通过 Wiki 名称查询 InPageEdit 的使用情况，如果查询结果大于 3，只显示前三个。

- **sitename** Wiki 的名称，取`wgSiteName`，

范例：`!ipes 萌娘百科`

## 一些小玩意

### ~~她这么可爱，打一拳一定会哭很久吧~~

如果你的发言触发特定的条件，例如骂她“人工智障”，她会予以回应。

```
> sili就是笨蛋！
< ¿你说谁是笨蛋呢?
```

### 更多有趣的功能

发送`sili，帮助`即可查看完整的帮助！

**PRs Welcome** 想到了什么有意思的功能？欢迎直接通过 PR 来添加！

---

## 开发指南

```sh
# init dependencies
pnpm i
# start
pnpm start
```

---

> MIT License
>
> Copyright (c) 2022 万界规划局(Every Planing Bureau) / 机智的小鱼君(Dragon-Fish)
