/**
 * @name Chatbot-SILI 万界规划局QQ机器人
 * @author Dragon-Fish <dragon-fish@qq.com>
 *
 * @license MIT
 */

import 'dotenv/config'
import { App, type Session, Random, Time } from 'koishi'
import { findChrome } from 'find-chrome-bin'

// Types
import {} from '@koishijs/plugin-database-mongo'
import {} from '@koishijs/plugin-help'
import {} from '@koishijs/plugin-rate-limit'
import {} from '@koishijs/plugin-switch'

// Services
import { HTMLService } from './utils/RenderHTML'

// Plugins
import PatchCallme from './plugins/callme'
import PluginAbout from './plugins/about'
import PluginHljs from './plugins/hljs'
import PluginMediawiki from './plugins/mediawiki'
import PluginMute from './plugins/mute'
import PluginPing from './plugins/ping'
import PluginPixiv from './plugins/pixiv'
import PluginPowerUser from './plugins/powerUser'
import PluginProfile from './plugins/profile'
import PluginQueue from './plugins/queue'
import PluginSensitiveFilter from './plugins/sensitive-words-filter'
import PluginSiliName from './plugins/siliName'
import PluginSticker from './plugins/sticker'
import PluginVerifyFandomUser from './plugins/verifyFandomUser'
import PluginVersion from './plugins/version'
import PluginYoudao from './plugins/youdao'

// Modules
import FandomDiscordConnect from './modules/fandomDiscordConnect'
import MessagesLogger from './modules/MessagesLogger'
import MintFilterService from './plugins/sensitive-words-filter/MintFilterService'
import MgpGroupUtils from './modules/MoegirlGroupUtils'
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
  // ctx.plugin('adapter-discord', {
  //   token:
  //     env.KOISHI_ENV === 'prod'
  //       ? env.TOKEN_DISCORD_BOT_SILI
  //       : env.TOKEN_DISCORD_BOT_XIAOYUJUN,
  // })
})

/** 安装插件 */
// @pollify v3 自带的指令
app.plugin(function PluginCollectionLegacy(ctx) {
  // [core]
  ctx.plugin(function PluginCollectionLegacyCore(ctx) {
    ctx.plugin('help')
    ctx.plugin('commands')
    ctx.plugin('switch')
    ctx.plugin('assets-s3', {
      credentials: {
        accessKeyId: env.TOKEN_S3_ACCESS_KEY_ID,
        secretAccessKey: env.TOKEN_S3_ACCESS_KEY_SECRET,
      },
      bucket: env.TOKEN_S3_BUCKET,
      pathPrefix: env.KOISHI_ENV === 'prod' ? 'v4/assets/' : 'v4-dev/assets/',
      publicUrl: `${env.TOKEN_S3_PUBLIC_URL}/${
        env.KOISHI_ENV === 'prod' ? 'v4/assets/' : 'v4-dev/assets/'
      }`,
      region: env.TOKEN_S3_REGION,
      endpoint: env.TOKEN_S3_ENDPOINT,
    })
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

        const noRepeatText = [
          'No，不要再复读了！',
          '🤚我说婷婷，你们搞复读，不讲武德。',
          '那么就到此为止吧，再复读就不礼貌了。',
          '🤚很抱歉打扰大家的复读，水群不要忘记多喝热水哟~',
        ]
        if (
          state.repeated &&
          state.times > 5 &&
          !noRepeatText.includes(state.content)
        ) {
          const hit = randomHit(0.1 * (state.times - 5))
          logger.info('[尝试打断复读]', hit)
          return hit ? session.send(Random.pick(noRepeatText)) : false
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
  ctx.plugin('dataview')
  ctx.plugin('insight')
  ctx.plugin('status')
  ctx.plugin('login', { admin: { enabled: false } })
  ctx.plugin('logger')
  ctx.plugin('sandbox')
})

// 第三方
app.plugin(async function PluginCollectionThirdParty(ctx) {
  // ctx.plugin('blive')
  // ctx.plugin('bvid')
  ctx.plugin('github', {
    path: '/api/github',
    appId: env.TOKEN_GITHUB_APPID,
    appSecret: env.TOKEN_GITHUB_APPSECRET,
    replyTimeout: 12 * Time.hour,
    replyFooter: '',
  })
  ctx.plugin('image-search', {
    saucenaoApiKey: env.TOKEN_SAUCENAO_APIKEY,
  })
  ctx.plugin('schedule')

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

app.plugin(function PluginCollectionDialogue(ctx) {
  ctx.plugin('dialogue-author')
  ctx.plugin('dialogue-context')
  // ctx.plugin('dialogue-flow')
  ctx.plugin('dialogue-rate-limit')
  ctx.plugin('dialogue', {
    prefix: env.KOISHI_ENV === 'prod' ? '?!' : '#',
    throttle: {
      responses: 10,
      interval: 1 * Time.minute,
    },
    preventLoop: {
      length: 3,
      participants: 1,
      debounce: 3 * Time.minute,
    },
  })
})

// SILI Core
app.plugin(function PluginCollectionSILICore(ctx) {
  ctx.plugin(PluginAbout)
  ctx.plugin(PluginHljs)
  ctx.plugin(PluginMute)
  ctx.plugin(PluginPing)
  ctx.plugin(PluginPixiv)
  ctx.plugin(PluginPowerUser)
  ctx.plugin(PluginProfile)
  ctx.plugin(PluginQueue)
  ctx.plugin(PluginSiliName)
  ctx.plugin(PluginSticker)
  ctx.plugin(PluginVerifyFandomUser)
  ctx.plugin(PluginVersion)
  ctx.plugin(PluginYoudao)

  // MediaWiki
  ctx.plugin(PluginMediawiki, {
    searchIfNotExist: true,
    showDetailsByDefault: true,
  })
  ctx.command('wiki.connect').config.authority = 2
})

// Internal utils
app.plugin(function PluginCollectionInternal(ctx) {
  // ctx.plugin(FandomDiscordConnect)
  ctx.plugin(HTMLService)
  ctx.plugin(MessagesLogger)
  ctx.plugin(MintFilterService)
  ctx.plugin(MgpGroupUtils)
  ctx.plugin(PatchCallme)
  ctx.plugin(ProcessErrorHandler)
  ctx.plugin(PluginSensitiveFilter)
})

/** 启动应用程序 */
app.start().then(() => {
  logger.info('🌈', 'SILI启动成功~')
})
