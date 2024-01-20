/**
 * @name Chatbot-SILI 万界规划局QQ机器人
 * @author Dragon-Fish <dragon-fish@qq.com>
 *
 * @license MIT
 */
import { config as setupDotEnv } from 'dotenv'

import { App, Dict, Random, type Session, Time } from 'koishi'

import { resolve } from 'node:path'

import { MinecraftBot } from '@/adapters/adapter-minecraft'
import MessagesLogger from '@/modules/MessagesLogger'
import { MinecraftConnect } from '@/modules/MinecraftConnect'
import MgpGroupUtils from '@/modules/MoegirlGroupUtils'
import ProcessErrorHandler from '@/modules/ProcessErrorHandler'
import HTMLService from '@/services/HTMLService'

import PluginAbout from '~/about'
import PatchCallme from '~/callme'
import PluginDatabaseAdmin from '~/dbadmin'
import PluginDice from '~/dice'
import PluginHljs from '~/hljs'
import PluginMediawiki from '~/mediawiki'
import PluginMute from '~/mute'
import PluginOpenAi from '~/openai'
import PluginPing from '~/ping'
import PluginPixiv from '~/pixiv'
import PluginPowerUser from '~/powerUser'
import PluginProfile from '~/profile'
import PluginQueue from '~/queue'
import PluginReboot from '~/reboot'
import PluginSensitiveFilter from '~/sensitive-words-filter'
import PluginSiliName from '~/siliName'
import PluginSpawn from '~/spawn'
import PluginSticker from '~/sticker'
import PluginVerifyFandomUser from '~/verifyFandomUser'
import PluginVersion from '~/version'
import PluginWebShot from '~/webshot'
import PluginWhoAsked from '~/whoAsked'
import PluginYoudao from '~/youdao'

import AdapterDingtalk from '@koishijs/plugin-adapter-dingtalk'
import AdapterDiscord from '@koishijs/plugin-adapter-discord'
import * as PluginAdmin from '@koishijs/plugin-admin'
import PluginAnalytics from '@koishijs/plugin-analytics'
import PluginAuth from '@koishijs/plugin-auth'
import * as PluginBind from '@koishijs/plugin-bind'
import * as PluginBroadcast from '@koishijs/plugin-broadcast'
import * as PluginCallme from '@koishijs/plugin-callme'
import PluginCommands from '@koishijs/plugin-commands'
import PluginConsole from '@koishijs/plugin-console'
import PluginMongo from '@koishijs/plugin-database-mongo'
import PluginDataview from '@koishijs/plugin-dataview'
import * as PluginEcho from '@koishijs/plugin-echo'
import PluginExplorer from '@koishijs/plugin-explorer'
import * as PluginHelp from '@koishijs/plugin-help'
import PluginInsight from '@koishijs/plugin-insight'
import * as PluginLogger from '@koishijs/plugin-logger'
import * as PluginSandbox from '@koishijs/plugin-sandbox'
import PluginServer from '@koishijs/plugin-server'
import * as PluginStatus from '@koishijs/plugin-status'

import AdapterRed from 'koishi-plugin-adapter-red'
import AdapterVilla from 'koishi-plugin-adapter-villa'
import PluginAssetsS3 from 'koishi-plugin-assets-s3'
import * as PluginBaidu from 'koishi-plugin-baidu'
import * as PluginDialogue from 'koishi-plugin-dialogue'
import * as PluginDialogueAuthor from 'koishi-plugin-dialogue-author'
import * as PluginDialogueContext from 'koishi-plugin-dialogue-context'
import * as PluginDialogueFlow from 'koishi-plugin-dialogue-flow'
import * as PluginDialogueRateLimit from 'koishi-plugin-dialogue-rate-limit'
import PluginGithub from 'koishi-plugin-github'
import * as PluginImageSearch from 'koishi-plugin-image-search'
import PluginPuppeteer from 'koishi-plugin-puppeteer'
import * as PluginRateLimit from 'koishi-plugin-rate-limit'
import * as PluginRecall from 'koishi-plugin-recall'
import * as PluginRepeater from 'koishi-plugin-repeater'
import * as PluginSchedule from 'koishi-plugin-schedule'
import PluginSilk from 'koishi-plugin-silk'
import * as PluginSwitch from 'koishi-plugin-switch'

const PROD = process.env.NODE_ENV === 'production'

// Setup .env
setupDotEnv()
setupDotEnv({
  path: resolve(__dirname, '..', PROD ? '.env.production' : '.env.development'),
  override: true,
})

const { env } = process

/** 初始化 Koishi 实例 */
const app = new App({
  nickname: env.KOISHI_NICKNAME?.split('|'),
  prefix: (ctx) => {
    const items = env.KOISHI_PREFIX?.split('|') || []
    if (ctx.platform === 'villa') items.unshift('/')
    return items
  },
})
// core services, init immediately
app.plugin(PluginServer, {
  port: env.KOISHI_PROT ? +env.KOISHI_PROT : undefined,
  selfUrl: env.KOISHI_SELF_URL,
})
const logger = app.logger('INIT')

/** 安装数据库 */
app.plugin(PluginMongo, {
  host: env.DB_MONGO_HOST,
  port: Number(env.DB_MONGO_PORT),
  // username: env.DB_MONGO_USER,
  // password: env.DB_MONGO_PASSWORD,
  database: env.DB_MONGO_DATABASE,
})

/** 安装适配器 */
app.plugin(function PluginCollectionAdapters(ctx) {
  // QQ
  //  ctx.plugin('adapter-onebot', {
  //    protocol: env.ONEBOT_PROTOCOL,
  //    selfId: env.ONEBOT_SELFID,
  //    endpoint: env.ONEBOT_ENDPOINT,
  //  })
  ctx.plugin(AdapterRed, {
    endpoint: env.CHRONOCAT_ENDPOINT,
    token: env.CHRONOCAT_TOKEN,
    selfId: env.ONEBOT_SELFID?.trim(),
    path: '/assets/red',
    selfUrl: env.KOISHI_SELF_URL,
  })

  // Discord
  // ctx.plugin(AdapterDiscord, {
  //   token: env.TOKEN_DISCORD_BOT,
  // })

  // DingTalk
  // const dingTokens = process.env.DINGTALK_TOKENS?.split('|')
  // if (dingTokens && dingTokens.length) {
  //   dingTokens.forEach((token) => {
  //     const [agentId, appkey, secret] = token?.split('/')
  //     if (!agentId || !appkey || !secret) return
  //     ctx.plugin(AdapterDingtalk, {
  //       protocol: 'ws',
  //       agentId: +agentId,
  //       appkey,
  //       secret,
  //     })
  //   })
  // }

  // Villa
  ctx.plugin(AdapterVilla, {
    id: process.env.VILLA_APPID,
    secret: process.env.VILLA_APPSECRET,
    pubKey: process.env.VILLA_PUBKEY,
    path: '/api/callback/villa',
    emoticon: undefined,
    transfer: undefined,
    /**
     * @TODO: `underscores_in_headers on;` should be set in nginx config
     */
    verifyCallback: true,
  })

  // Minecraft
  if (env.MINECRAFT_TOKEN) {
    ctx.plugin(MinecraftBot, {
      host: env.MINECRAFT_HOST,
      port: Number(env.MINECRAFT_PORT),
      protocol: env.MINECRAFT_PROTOCOL as 'ws' | 'wss',
      token: env.MINECRAFT_TOKEN,
    })
  }

  // Repl
  // ctx.plugin('adapter-repl')
})

/** 安装插件 */
// @pollify v3 自带的指令
app.plugin(function PluginCollectionLegacy(ctx) {
  // [core]
  ctx.plugin(function PluginCollectionLegacyCore(ctx) {
    ctx.plugin(PluginHelp)
    ctx.command('help').alias('帮助')
    ctx.plugin(PluginCommands)
    ctx.plugin(PluginSwitch)
    ctx.plugin(PluginAssetsS3, {
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
    ctx.plugin(PluginAdmin) // channel user auth
    ctx.plugin(PluginBind)
    ctx.plugin(PluginBroadcast)
    ctx.plugin(PluginCallme)
    ctx.plugin(PluginEcho)
    ctx.command('echo', { authority: 3 })
    ctx.plugin(PluginRateLimit)
    ctx.plugin(PluginRecall)
    const randomHit = (probability: number) => Math.random() < probability
    ctx.plugin(PluginRepeater, {
      onRepeat(state: RepeatState, session: Session) {
        if (!state.repeated && state.times > 3) {
          const hit = randomHit(0.125 * state.times)
          logger.info('[尝试参与复读]', hit)
          return hit ? state.content : ''
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
          return hit ? Random.pick(noRepeatText) : ''
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
    ctx.plugin(PluginBaidu)
  })
})

// 网页控制台
app.plugin(function PluginCollectionConsole(ctx) {
  ctx.plugin(PluginConsole, {
    title: 'SILI 监控中心',
    uiPath: '/dash',
    apiPath: '/api/status',
  })
  ctx.plugin(PluginAnalytics)
  ctx.plugin(PluginAuth, { admin: { enabled: false } })
  ctx.plugin(PluginDataview)
  ctx.plugin(PluginExplorer)
  ctx.plugin(PluginInsight)
  ctx.plugin(PluginLogger)
  ctx.plugin(PluginStatus)
  ctx.plugin(PluginSandbox)
})

// 第三方
app.plugin(async function PluginCollectionThirdParty(ctx) {
  ctx.plugin(PluginGithub, {
    path: '/api/github',
    appId: env.TOKEN_GITHUB_APPID,
    appSecret: env.TOKEN_GITHUB_APPSECRET,
    replyTimeout: 12 * Time.hour,
    replyFooter: '',
  })
  ctx.plugin(PluginImageSearch, {
    saucenaoApiKey: env.TOKEN_SAUCENAO_APIKEY,
  })
  ctx.plugin(PluginPuppeteer, {
    // headless: 'new',
  })
  ctx.plugin(PluginSchedule)
  ctx.plugin(PluginSilk)
})

app.plugin(function PluginCollectionDialogue(ctx) {
  ctx.plugin(PluginDialogue, {
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
  ctx.plugin(PluginDialogueAuthor)
  ctx.plugin(PluginDialogueContext)
  // ctx.plugin(PluginDialogueFlow)
  ctx.plugin(PluginDialogueRateLimit)
})

// SILI Core
app.plugin(function PluginCollectionSILICore(ctx) {
  ctx.plugin(PluginAbout)
  ctx.plugin(PluginDice)
  ctx.plugin(PluginHljs)
  ctx.plugin(PluginMute)
  ctx.plugin(PluginOpenAi, {
    openaiOptions: {
      baseURL: env.OPENAI_BASE_RUL,
      apiKey: env.OPENAI_API_KEY,
    },
    maxTokens: 500,
    recordsPerChannel: 50,
    model: 'gpt-4-1106-preview',
  })
  ctx.plugin(PluginPing)
  ctx.plugin(PluginPixiv, {
    baseURL: env.API_PIXIV_BASE,
    pximgURL: env.API_PIXIV_IMG,
  })
  ctx.plugin(PluginPowerUser)
  ctx.plugin(PluginProfile)
  ctx.plugin(PluginQueue)
  ctx.plugin(PluginSiliName)
  ctx.plugin(PluginSticker)
  ctx.plugin(PluginVerifyFandomUser)
  ctx.plugin(PluginVersion)
  ctx.plugin(PluginWebShot)
  ctx.plugin(PluginWhoAsked)
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
  ctx.command('admin', '维护指令集')
  ctx.command('tools', '实用工具集')
  ctx.plugin(HTMLService)
  ctx.plugin(MessagesLogger)
  ctx.plugin(MgpGroupUtils)
  ctx.plugin(PatchCallme)
  ctx.plugin(ProcessErrorHandler)
  ctx.plugin(PluginDatabaseAdmin)
  ctx.plugin(PluginReboot)
  ctx.plugin(PluginSensitiveFilter)
  ctx.plugin(PluginSpawn, { shell: 'pwsh' })
  ctx.plugin(MinecraftConnect)
})

/** 启动应用程序 */
app.start().then(() => {
  logger.info('🌈', 'SILI启动成功~')
})

// Types
interface RepeatState {
  content: string
  repeated: boolean
  times: number
  users: Dict<number>
}
