/**
 * @name Chatbot-SILI 万界规划局QQ机器人
 * @author Dragon-Fish <dragon-fish@qq.com>
 *
 * @license MIT
 */
import { config as setupDotEnv } from 'dotenv'

import { App, Dict, Random, type Session, Time } from 'koishi'

import { resolve } from 'node:path'

import FallbackHandler from '@/modules/FallbackHandler'
import MessagesLogger from '@/modules/MessagesLogger'
import { MinecraftConnect } from '@/modules/MinecraftConnect'
import MgpGroupUtils from '@/modules/MoegirlGroupUtils'
import ProcessErrorHandler from '@/modules/ProcessErrorHandler'
import HTMLService from '@/services/HTMLService'
import PiggybackService from '@/services/PiggybackService'

import PluginAbout from '~/about'
import PatchCallme from '~/callme'
import PluginDatabaseAdmin from '~/dbadmin'
import { PluginDebug } from '~/debug'
import PluginDice from '~/dice'
import PluginHljs from '~/hljs'
import PluginJMComic from '~/jm-comic'
import { PluginLookupIP } from '~/lookup-ip'
import PluginMediawiki from '~/mediawiki'
import PluginMinecraft from '~/minecraft'
import PluginMute from '~/mute'
import PluginOpenAi from '~/openai'
import PluginPing from '~/ping'
import PluginPixiv from '~/pixiv'
import PluginPowerUser from '~/power-user'
import PluginProfile from '~/profile'
import PluginQueue from '~/queue'
import PluginReboot from '~/reboot'
import PluginRepeater, { RepeatState } from '~/repeater'
import PluginSensitiveFilter from '~/sensitive-words-filter'
import PluginSiliName from '~/sili-name'
import PluginSpawn from '~/spawn'
import PluginSticker from '~/sticker'
import PluginToImage from '~/to-image'
import PluginVerifyFandomUser from '~/verify-fandom-user'
import PluginVersion from '~/version'
import PluginWebShot from '~/webshot'
import PluginWhoAsked from '~/who-asked'
import PluginYoudao from '~/youdao'

import AdapterDingtalk from '@koishijs/plugin-adapter-dingtalk'
import AdapterDiscord from '@koishijs/plugin-adapter-discord'
import AdapterKook from '@koishijs/plugin-adapter-kook'
import AdapterQQ, { QQ } from '@koishijs/plugin-adapter-qq'
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

import AdapterOnebot from 'koishi-plugin-adapter-onebot'
import PluginAssetsS3 from 'koishi-plugin-assets-s3'
import * as PluginBaidu from 'koishi-plugin-baidu'
import * as PluginDialogue from 'koishi-plugin-dialogue'
import * as PluginDialogueAuthor from 'koishi-plugin-dialogue-author'
import * as PluginDialogueContext from 'koishi-plugin-dialogue-context'
import * as PluginDialogueFlow from 'koishi-plugin-dialogue-flow'
import * as PluginDialogueRateLimit from 'koishi-plugin-dialogue-rate-limit'
import PluginGithub from 'koishi-plugin-github'
import * as PluginImageSearch from 'koishi-plugin-image-search'
import * as PluginNovelAi from 'koishi-plugin-novelai'
import PluginPuppeteer from 'koishi-plugin-puppeteer'
import * as PluginRateLimit from 'koishi-plugin-rate-limit'
import * as PluginRecall from 'koishi-plugin-recall'
import * as PluginSchedule from 'koishi-plugin-schedule'
import PluginSilk from 'koishi-plugin-silk'
import * as PluginSwitch from 'koishi-plugin-switch'

import PluginHTTP from '@cordisjs/plugin-http'

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
    if (['qq', 'qqguild'].includes(ctx.platform)) {
      return ''
    }
    const items = env.KOISHI_PREFIX?.split('|') || []
    if (['villa', 'discord'].includes(ctx.platform)) {
      items.unshift('/')
    }
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
  if (process.env.ONEBOT_SELFID) {
    ctx.plugin(AdapterOnebot, {
      protocol: env.ONEBOT_PROTOCOL,
      selfId: env.ONEBOT_SELFID?.trim(),
      endpoint: env.ONEBOT_ENDPOINT,
    })
  }
  if (process.env.QQBOT_APPID) {
    ctx.plugin(AdapterQQ, {
      sandbox: true,
      id: env.QQBOT_APPID,
      token: env.QQBOT_TOKEN,
      secret: env.QQBOT_SECRET,
      type: env.QQBOT_TYPE,
      intents:
        QQ.Intents.GUILDS |
        QQ.Intents.GUILD_MEMBERS |
        QQ.Intents.PUBLIC_GUILD_MESSAGES |
        QQ.Intents.OPEN_FORUMS_EVENT |
        QQ.Intents.INTERACTIONS |
        QQ.Intents.MESSAGE_AUDIT,
    })
  }

  // Discord
  if (env.TOKEN_DISCORD_BOT) {
    ctx.plugin(AdapterDiscord, {
      token: env.TOKEN_DISCORD_BOT,
    })
  }

  // DingTalk
  const DINGTALK_AGENTID = process.env.DINGTALK_AGENTID
  const DINGTALK_APPKEY = process.env.DINGTALK_APPKEY
  const DINGTALK_SECRET = process.env.DINGTALK_SECRET
  if (DINGTALK_AGENTID && DINGTALK_APPKEY && DINGTALK_SECRET) {
    ctx.plugin(AdapterDingtalk, {
      protocol: 'ws',
      agentId: +DINGTALK_AGENTID,
      appkey: DINGTALK_APPKEY,
      secret: DINGTALK_SECRET,
    })
  }

  if (env.KOOK_TOKEN) {
    ctx.plugin(AdapterKook, {
      protocol: 'ws',
      token: env.KOOK_TOKEN,
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
    ctx.plugin(PluginHTTP)
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
  })
  ctx.plugin(PluginDialogueAuthor)
  ctx.plugin(PluginDialogueContext)
  // ctx.plugin(PluginDialogueFlow)
  ctx.plugin(PluginDialogueRateLimit, {
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

  // FIXME: 禁止一般用户使用问答查询
  ctx.on(
    'dialogue/before-action',
    (session: PluginDialogue.Dialogue.Session) => {
      const userAuth = session.user?.authority || 0
      if (userAuth <= 2) {
        return '你没有权限执行此操作。'
      }
    }
  )
})

// SILI Core
app.plugin(function PluginCollectionSILICore(ctx) {
  ctx.plugin(PluginAbout)
  ctx.plugin(PluginDice)
  ctx.plugin(PluginHljs)
  ctx.plugin(PluginJMComic)
  if (process.env.TOKEN_IPGEOLOCATION) {
    ctx.plugin(PluginLookupIP, {
      ipgeoApiKey: process.env.TOKEN_IPGEOLOCATION,
    })
  }
  ctx.plugin(PluginMinecraft)
  ctx.plugin(PluginMute)
  if (process.env.NOVELAI_USERNAME) {
    // 部分开启 NovelAI 测试
    ctx
      .channel(
        process.env.CHANNEL_QQ_SANDBOX,
        process.env.CHANNEL_QQ_SILI_HOME,
        process.env.CHANNEL_QQ_NGNL_COMMON,
        process.env.CHANNEL_QQ_IPE
      )
      .plugin(PluginNovelAi, {
        type: 'login',
        email: process.env.NOVELAI_USERNAME,
        password: process.env.NOVELAI_PASSWORD,
        model: 'nai-v3',
        basePrompt: 'best quality, amazing quality, very aesthetic, absurdres',
        resolution: { width: 832, height: 1216 },
        scale: 8,
        latinOnly: true,
      })
    ctx.command('novelai', {
      minInterval(session) {
        if ((session.user as any)?.authority > 1) return 0
        return 60 * 1000
      },
      maxUsage(session) {
        if ((session.user as any)?.authority > 1) return undefined
        return 10
      },
    })
  }
  ctx.plugin(PluginOpenAi, {
    openaiOptions: {
      baseURL: env.OPENAI_BASE_RUL,
      apiKey: env.OPENAI_API_KEY,
    },
    maxTokens: 500,
    recordsPerChannel: 50,
    model: env.OPENAI_MODEL || 'gpt-4o',
  })
  ctx.plugin(PluginPing)
  ctx.plugin(PluginPixiv, {
    apiBaseURL: env.PIXIV_API_BASE,
    webBaseURL: env.PIXIV_WEB_BASE,
    pximgBaseURL: env.PIXIV_IMG_BASE,
  })
  ctx.plugin(PluginPowerUser)
  ctx.plugin(PluginProfile)
  ctx.plugin(PluginQueue)
  ctx.plugin(PluginSiliName)
  ctx.plugin(PluginSticker)
  ctx.plugin(PluginToImage)
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
  ctx.plugin(FallbackHandler)
  ctx.plugin(MessagesLogger)
  ctx.plugin(MgpGroupUtils)
  ctx.plugin(PatchCallme)
  ctx.plugin(PiggybackService)
  ctx.plugin(ProcessErrorHandler)
  ctx.plugin(PluginDatabaseAdmin)
  ctx.plugin(PluginDebug)
  ctx.plugin(PluginReboot)
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
  ctx.plugin(PluginSensitiveFilter)
  ctx.plugin(PluginSpawn, { shell: 'pwsh' })
  ctx.plugin(MinecraftConnect)
})

/** 启动应用程序 */
app.start().then(() => {
  logger.info('🌈', 'SILI启动成功~')
})
