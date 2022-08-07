/**
 * @name Chatbot-SILI 万界规划局QQ机器人
 * @author Dragon-Fish <dragon-fish@qq.com>
 *
 * @license MIT
 */

import 'dotenv/config'
import { App, segment, type Session } from 'koishi'
import { env } from 'node:process'

import {} from '@koishijs/plugin-help'
import {} from '@koishijs/plugin-rate-limit'
import {} from '@koishijs/plugin-switch'

import PluginPing from './plugins/ping'
import MessagesLogger from './modules/onMessages'
import PatchCallme from './plugins/callme'
import PluginMute from './plugins/mute'
import MgpGroupUtils from './modules/mgpGroupUtils'

interface RepeatState {
  content: string
  repeated: boolean
  times: number
  users: Record<number, number>
}

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
app.plugin('commands')
app.plugin('suggest')
app.plugin('switch')
// [common]
app.plugin('admin') // channel user auth
app.plugin('bind')
app.plugin('broadcast')
app.plugin('callme')
app.plugin('echo')
app.plugin('rate-limit')
app.plugin('recall')
app.plugin('repeater', {
  onRepeat(state: RepeatState, session: Session) {
    if (!state.repeated && state.times > 3) {
      return Math.random() < 0.8 ? state.content : void 0
    }
    if (state.repeated && state.times >= 10) {
      return 'No，不要再复读了！'
    }
  },
  onInterrupt: (state: RepeatState, session: Session) =>
    state.repeated &&
    state.times >= 3 &&
    Math.random() > 0.5 &&
    segment.at(session.userId as string) + '在？为什么打断复读？',
})
// [tools]
app.plugin('baidu')

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
  prefix: env.KOISHI_ENV === 'prod' ? '?!' : '#',
})

// SILI Core
app.plugin(PluginPing)
app.plugin(PluginMute)

// Internal utils
app.plugin(MessagesLogger)
app.plugin(MgpGroupUtils)
app.plugin(PatchCallme)

/** 启动应用程序 */
app.start().then(() => {
  logger.info('🌈', 'SILI启动成功~')
})
