import { readFileSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { Context, Session } from 'koishi'
import { resolve } from 'path'
import BasePlugin from './_boilerplate'

const signalFile = resolve(__dirname, '../../.koishi_signal')
const signalLogFile = resolve(__dirname, '../../.koishi_signal_log')

export default class PluginReboot extends BasePlugin {
  constructor(public ctx: Context) {
    super(ctx, {}, 'reboot')

    this.notifyReboot()

    ctx
      .command('reboot', '重启机器人', { authority: 4 })
      .option('sync', '-s')
      .action(async ({ session, options }) => {
        await session.send('请在 10 秒内发送句号以确认重启……')
        const ensure = await (session as Session).prompt(10 * 1000)
        if (!['.', '。'].includes(ensure)) {
          return '重启申请已被 SILI 驳回。'
        }

        let signal = 0
        signal += 1 << 0
        if (options.sync) signal += 1 << 1
        if (options.fast || 1) signal += 1 << 2
        writeFileSync(signalFile, signal.toString())
        writeFileSync(
          signalLogFile,
          JSON.stringify({
            signal,
            options,
            time: Date.now(),
            userId: session.userId,
            platform: session.platform,
            channelId: session.channelId,
          })
        )

        await session.send('SILI 正在准备重启...')
        process.exit(0)
      })
  }

  private async notifyReboot() {
    let log: any
    // 尝试读取最后的重启日志
    try {
      log = JSON.parse((await readFile(signalLogFile)).toString())
    } catch (_) {
      return console.info('未找到重启日志。')
    }

    if (log && log.platform && log.channelId) {
      const bot = this.ctx.bots.find((i) => i.platform === log.platform)
      if (!bot) return console.info('未找到对应的机器人实例。')
      bot.sendMessage(
        log.channelId,
        `SILI 已完成重启。\n${JSON.stringify(log, null, 2)}`
      )
      writeFileSync(signalLogFile, 'null')
    }
  }
}
