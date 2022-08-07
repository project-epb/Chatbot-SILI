/**
 * @name Chatbot-SILI 万界规划局QQ机器人
 * @author Dragon-Fish <dragon-fish@qq.com>
 *
 * @license MIT
 */

import 'dotenv/config'
import { App, segment, type Session } from 'koishi'
// import { env } from 'node:process'
const { env } = process

import {} from '@koishijs/plugin-help'
import {} from '@koishijs/plugin-database-mongo'
import {} from '@koishijs/plugin-rate-limit'
import {} from '@koishijs/plugin-switch'

import PluginPing from './plugins/ping'
import MessagesLogger from './modules/MessagesLogger'
import PatchCallme from './plugins/callme'
import PluginMute from './plugins/mute'
import MgpGroupUtils from './modules/MgpGroupUtils'
import PluginPixiv from './plugins/pixiv'
import PluginVerifyFandomUser from './plugins/verifyFandomUser'
import FandomDiscordConnect from './modules/fandomDiscordConnect'
import PluginAbout from './plugins/about'
import PluginVersion from './plugins/version'

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
app.plugin('adapter-discord', {
  token:
    env.KOISHI_ENV === 'prod'
      ? env.TOKEN_DISCORD_BOT_SILI
      : env.TOKEN_DISCORD_BOT_XIAOYUJUN,
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
const randomHit = (probability: number) => Math.random() < probability
app.plugin('repeater', {
  onRepeat(state: RepeatState, session: Session) {
    if (!state.repeated && state.times > 3) {
      const hit = randomHit(0.125 * state.times)
      logger.info('[尝试参与复读]', hit)
      return hit ? session.send(state.content) : false
    }
    if (state.repeated && state.times > 5) {
      const hit = randomHit(0.1 * (state.times - 5))
      logger.info('[尝试打断复读]', hit)
      return hit ? session.send('No，不要再复读了！') : false
    }
  },
  // onInterrupt(state: RepeatState, session: Session) {
  //   if (!state.repeated) return
  //   const hit = randomHit(0.1 * (state.times - 5))
  //   logger.info('[尝试质询打断]', hit)
  //   return hit
  //     ? session.send(
  //         `${segment.at(session.userId as string)}在？为什么打断复读？`
  //       )
  //     : false
  // },
})
// [tools]
app.plugin('baidu')

// 网页控制台
app.plugin('console', {
  title: 'SILI 监控中心',
  uiPath: '/dash',
  apiPath: '/api/status',
})
app.plugin('auth')
app.plugin('dataview')
app.plugin('insight')
app.plugin('status')
app.plugin('logger')
app.plugin('sandbox')

// 第三方
// app.plugin('blive')
app.plugin('bvid')
app.plugin('github', {
  path: '/api/github',
  appId: env.TOKEN_GITHUB_APPID,
  appSecret: env.TOKEN_GITHUB_APPSECRET,
})
app.plugin('image-search', {
  saucenaoApiKey: env.TOKEN_SAUCENAO_APIKEY,
})
app.plugin('mediawiki')
app.plugin('schedule')
app.plugin('teach', {
  prefix: env.KOISHI_ENV === 'prod' ? '?!' : '#',
})

// SILI Core
app.plugin(PluginAbout)
app.plugin(PluginPing)
app.plugin(PluginMute)
app.plugin(PluginPixiv)
app.plugin(PluginVerifyFandomUser)
app.plugin(PluginVersion)

// Internal utils
app.plugin(FandomDiscordConnect)
app.plugin(MessagesLogger)
app.plugin(MgpGroupUtils)
app.plugin(PatchCallme)

/** 启动应用程序 */
app.start().then(() => {
  logger.info('🌈', 'SILI启动成功~')
})
