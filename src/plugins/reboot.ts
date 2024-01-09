import { readFile, writeFile } from 'fs/promises'
import { Context, Session, h } from 'koishi'
import { resolve } from 'path'
import BasePlugin from './_boilerplate'
import { safelyStringify } from '../utils/safelyStringify'
import {
  getUserIdFromSession,
  getUserNickFromSession,
  sendMessageBySession,
} from '../utils/formatSession'

enum LogFile {
  signal = '.koishi_signal',
  commandLogs = '.koishi_signal_cmdlogs',
  lastSession = '.koishi_signal_lastsession',
}
enum KSignal {
  isReboot = 1 << 0,
  isGitSync = 1 << 1,
  isFastReboot = 1 << 2,
  isDumpDB = 1 << 3,
}

type SessionLog = {
  kSignal: `${number}`
  options: any
  time: number
  session: Session
}

export default class PluginReboot extends BasePlugin {
  static inject = ['html']

  constructor(public ctx: Context) {
    super(ctx, {}, 'reboot')

    this.initCommands()
    this.onAfterReboot()
  }

  private initCommands() {
    const ctx = this.ctx

    ctx
      .command('admin/reboot', '重启机器人', { authority: 4 })
      .option('sync', '-s 从 Git 同步并处理依赖')
      .option('dumpdb', '-d 备份数据库')
      .option('yes', '-y 跳过确认', { hidden: true })
      .action(async ({ session, options }) => {
        if (!options.yes) {
          await session.send('请在 10 秒内发送句号以确认重启……')
          const ensure = await (session as Session).prompt(10 * 1000)
          if (!['.', '。'].includes(ensure)) {
            return '重启申请被 SILI 驳回。'
          }
        }

        let kSignal = 0
        kSignal |= KSignal.isReboot
        if (options.sync) kSignal |= KSignal.isGitSync
        kSignal |= KSignal.isFastReboot
        if (options.dumpdb) kSignal |= KSignal.isDumpDB

        await Promise.all([
          await this.writeLogFile(LogFile.signal, kSignal.toString()),
          await this.writeLogFile(
            LogFile.lastSession,
            safelyStringify({
              kSignal,
              options,
              time: Date.now(),
              session: {
                ...session.toJSON(),
                content: session.content,
              },
            })
          ),
        ])

        await session.send('SILI 正在重启...')
        process.exit(0)
      })
  }

  async readLogFile(file: LogFile): Promise<string | null> {
    const path = resolve(__dirname, '../../', file)
    try {
      const content = (await readFile(path)).toString()
      return content.trim() || null
    } catch (e) {
      return null
    }
  }
  async writeLogFile(file: LogFile, content: string) {
    const path = resolve(__dirname, '../../', file)
    await writeFile(path, content)
  }
  async removeLogFile(file: LogFile) {
    try {
      await this.writeLogFile(file, '')
    } catch (e) {}
  }

  private async onAfterReboot() {
    let lastSession!: SessionLog
    // 尝试读取最后的重启日志
    try {
      lastSession = JSON.parse(await this.readLogFile(LogFile.lastSession))
    } catch (_) {
      return console.info('未找到重启日志。')
    } finally {
      this.removeLogFile(LogFile.lastSession)
    }

    const cmdLogsRaw = await this.readLogFile(LogFile.commandLogs)
    let cmdLogsImg: h | string = ''
    if (cmdLogsRaw) {
      ;[cmdLogsImg] = await Promise.all([
        await this.ctx.root.html.hljs(cmdLogsRaw, 'shell'),
        await this.removeLogFile(LogFile.commandLogs),
      ])
    }

    if (lastSession && lastSession.session) {
      const now = Date.now()
      const { session, kSignal } = lastSession
      const bot = this.ctx.bots.find((i) => i.platform === session.platform)
      if (!bot) return console.info('未找到对应的机器人实例。')

      console.info(session)

      sendMessageBySession(
        session,
        `SILI 重启完毕 (SIGNAL-${(+kSignal).toString(2).padStart(6, '0')})
共耗时: ${((now - lastSession.time) / 1000).toFixed(2)}s
请求者: ${h.at(getUserIdFromSession(session), {
          name: getUserNickFromSession(session),
        })}
${cmdLogsImg || '(没有详细日志)'}`
      )
    }
  }
}
