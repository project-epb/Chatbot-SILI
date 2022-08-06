import 'dotenv/config'
import { App } from 'koishi'
import { env } from 'node:process'

import PluginPing from './plugins/ping'
import MessagesLogger from './modules/onMessages'

/** 初始化 Koishi 实例 */
const app = new App(
  env.KOISHI_ENV === 'prod'
    ? {
        port: 3100,
        selfUrl: 'https://sili.wjghj.cn',
        nickname: ['sili', 'SILI'],
        prefix: ['!', '！'],
      }
    : {
        port: 3100,
        selfUrl: 'http://localhost',
        nickname: ['亚当', 'adam'],
        prefix: [';', '；'],
      }
)

const logger = app.logger('INIT')

/** 安装数据库 */
app.plugin('database-mongo', {
  host: env.DB_MONGO_HOST,
  port: Number(env.DB_MONGO_PORT),
  // username: env.DB_MONGO_USER,
  // password: env.DB_MONGO_PASSWORD,
  database: env.KOISHI_ENV === 'prod' ? env.DB_MONGO_DATABASE : 'koishi_v4_dev',
})

/** 安装适配器 */
// QQ
app.plugin('adapter-onebot', {
  protocol: env.ONEBOT_PROTOCOL,
  selfId: env.KOISHI_ENV === 'prod' ? env.ONEBOT_SELFID : env.ACCOUNT_QQ_ADAM,
  endpoint: env.ONEBOT_ENDPOINT,
})
// Discord
env.KOISHI_ENV === 'prod' &&
  app.plugin('adapter-discord', {
    token: env.TOKEN_DISCORD_BOT_SILI,
  })

/** 安装插件 */
// @pollify v3 自带的指令
// [core]
app.plugin('help')
app.plugin('suggest')
// [common]
app.plugin('admin') // channel user auth
app.plugin('bind')
app.plugin('broadcast')
app.plugin('callme')
app.plugin('echo')
app.plugin('recall')
// [tools]

// 网页控制台
app.plugin('console')
app.plugin('auth')
app.plugin('dataview')
app.plugin('insight')
app.plugin('status')
app.plugin('logger')
app.plugin('sandbox')

// 第三方
// app.plugin('blive')
app.plugin('bvid')
app.plugin('mediawiki')
app.plugin('schedule')
app.plugin('teach', {
  prefix: '?!',
})

// SILI Core
app.plugin(PluginPing)

// Internal utils
app.plugin(MessagesLogger)

/** 启动应用程序 */
app.start().then(() => {
  logger.info('🌈', 'SILI启动成功~')
})
