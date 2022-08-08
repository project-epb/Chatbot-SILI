/**
 * @name Chatbot-SILI 万界规划局QQ机器人
 * @author Dragon-Fish <dragon-fish@qq.com>
 *
 * @license MIT
 */

import 'dotenv/config'
import { App, type Session } from 'koishi'
import { findChrome } from 'find-chrome-bin'

import {} from '@koishijs/plugin-help'
import {} from '@koishijs/plugin-database-mongo'
import {} from '@koishijs/plugin-rate-limit'
import {} from '@koishijs/plugin-switch'

import PluginPing from './plugins/ping'
import MessagesLogger from './modules/MessagesLogger'
import PatchCallme from './plugins/callme'
import PluginMute from './plugins/mute'
import MgpGroupUtils from './modules/MoegirlGroupUtils'
import PluginPixiv from './plugins/pixiv'
import PluginVerifyFandomUser from './plugins/verifyFandomUser'
import FandomDiscordConnect from './modules/fandomDiscordConnect'
import PluginAbout from './plugins/about'
import PluginVersion from './plugins/version'
import ProcessErrorHandler from './modules/ProcessErrorHandler'

interface RepeatState {
  content: string
  repeated: boolean
  times: number
  users: Record<number, number>
}

const { env } = process

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
app.plugin(function PluginCollectionAdapters(ctx) {
  // QQ
  ctx.plugin('adapter-onebot', {
    protocol: env.ONEBOT_PROTOCOL,
    selfId: env.KOISHI_ENV === 'prod' ? env.ONEBOT_SELFID : env.ACCOUNT_QQ_ADAM,
    endpoint: env.ONEBOT_ENDPOINT,
  })
  // Discord
  ctx.plugin('adapter-discord', {
    token:
      env.KOISHI_ENV === 'prod'
        ? env.TOKEN_DISCORD_BOT_SILI
        : env.TOKEN_DISCORD_BOT_XIAOYUJUN,
  })
})

/** 安装插件 */
// @pollify v3 自带的指令
app.plugin(function PluginCollectionLegacy(ctx) {
  // [core]
  ctx.plugin(function PluginCollectionLegacyCore(ctx) {
    ctx.plugin('help')
    ctx.plugin('commands')
    ctx.plugin('suggest')
    ctx.plugin('switch')
  })
  // [common]
  ctx.plugin(function PluginCollectionLegacyCommon(ctx) {
    ctx.plugin('admin') // channel user auth
    ctx.plugin('bind')
    ctx.plugin('broadcast')
    ctx.plugin('callme')
    ctx.plugin('echo')
    ctx.plugin('rate-limit')
    ctx.plugin('recall')
    const randomHit = (probability: number) => Math.random() < probability
    ctx.plugin('repeater', {
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
  })
  // [tools]
  ctx.plugin(function PluginCollectionLegacyTools(ctx) {
    ctx.plugin('baidu')
  })
})

// 网页控制台
app.plugin(function PluginCollectionConsole(ctx) {
  ctx.plugin('console', {
    title: 'SILI 监控中心',
    uiPath: '/dash',
    apiPath: '/api/status',
  })
  ctx.plugin('auth')
  ctx.plugin('dataview')
  ctx.plugin('insight')
  ctx.plugin('status')
  ctx.plugin('logger')
  ctx.plugin('sandbox')
})

// 第三方
app.plugin(async function PluginCollectionThirdParty(ctx) {
  // ctx.plugin('blive')
  ctx.plugin('bvid')
  ctx.plugin('github', {
    path: '/api/github',
    appId: env.TOKEN_GITHUB_APPID,
    appSecret: env.TOKEN_GITHUB_APPSECRET,
  })
  ctx.plugin('image-search', {
    saucenaoApiKey: env.TOKEN_SAUCENAO_APIKEY,
  })

  // MediaWiki
  ctx.plugin('mediawiki')
  ctx.command('wiki.link').config.authority = 2
  ctx.command('wiki.flag').config.authority = 2
  ctx.command('wiki.parse').config.authority = 3
  ctx.command('wiki.shot').config.authority = 3

  ctx.plugin('schedule')
  ctx.plugin('teach', {
    prefix: env.KOISHI_ENV === 'prod' ? '?!' : '#',
  })

  try {
    const chrome = await findChrome({})
    logger.info('[puppeteer] 找到了合适的 Chrome', chrome)
    ctx.plugin('puppeteer', {
      browser: {
        executablePath: chrome.executablePath,
      },
    })
  } catch (e) {
    logger.warn('[puppeteer] 未找到合适的 Chrome', e.message)
  }
})

// SILI Core
app.plugin(function PluginCollectionSILICore(ctx) {
  ctx.plugin(PluginAbout)
  ctx.plugin(PluginPing)
  ctx.plugin(PluginMute)
  ctx.plugin(PluginPixiv)
  ctx.plugin(PluginVerifyFandomUser)
  ctx.plugin(PluginVersion)
})

// Internal utils
app.plugin(function PluginCollectionInternal(ctx) {
  ctx.plugin(FandomDiscordConnect)
  ctx.plugin(MessagesLogger)
  ctx.plugin(MgpGroupUtils)
  ctx.plugin(PatchCallme)
  ctx.plugin(ProcessErrorHandler)
})

/** 启动应用程序 */
app.start().then(() => {
  logger.info('🌈', 'SILI启动成功~')
})
