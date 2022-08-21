/**
 * @name PluginVerifyFandomUser
 * @command verify-qq
 * @desc Fandom编辑者QQ群入群检测
 * @authority 1
 */

import { Context, segment, Session } from 'koishi'
import axios from 'axios'
import { createHash } from 'crypto'

export const name = 'verify-fandom-user'

declare module 'koishi' {
  interface Channel {
    userBlacklist: string[]
  }
}

export default class PluginVerifyFandomUser {
  constructor(public ctx: Context) {
    ctx = ctx.channel()
    ctx.model.extend('channel', {
      userBlacklist: 'list',
    })

    // 指令
    ctx
      .command('verify-qq', '验证Fandom用户QQ信息')
      .option('qq', '-q <qq:string>')
      .option('user', '-u <user:string>')
      .action(async ({ session, options }) => {
        const { msg } = await this.verifyQQ(
          session as Session,
          options as { user?: string; qq?: string }
        )
        return msg
      })

    ctx
      .channel(
        '' + process.env.CHANNEL_QQ_FANDOM,
        '' + process.env.CHANNEL_QQ_SANDBOX
      )
      .on('guild-member-request', async (session) => {
        const { userId, content } = session
        const answer = content?.split('答案：')[1] || ''

        await session.send(`!verify-qq --qq ${userId} --user ${answer.trim()}`)

        let msg: string, status: boolean
        try {
          const verify = await this.verifyQQ(session, {
            qq: userId,
            user: answer.trim(),
          })
          msg = verify.msg
          status = verify.status
        } catch (err) {
          this.logger.warn(err)
          return `查询时遇到错误：${err.message}`
        }

        session.sendQueued(msg)
        if (status) {
          try {
            await session.bot.handleGuildMemberRequest(
              session.messageId as string,
              true
            )
            session.sendQueued('已自动通过入群申请。')
          } catch (err) {
            session.sendQueued(`自动通过入群申请时遇到错误：${err}`)
          }
        } else {
          session.sendQueued(
            [
              '请手动检查该用户信息，复制拒绝理由:',
              'QQ号验证失败，请参阅群说明',
            ].join('\n')
          )
        }
      })
  }

  async verifyQQ(session: Session, options: { user?: string; qq?: string }) {
    let msg = '',
      status = false

    if (!options.user) {
      msg = '× 验证失败\n未指定用户名'
      return { msg, status }
    }

    const { userBlacklist } = await this.ctx.database.getChannel(
      session.platform,
      session.channelId as string,
      ['userBlacklist']
    )

    if (userBlacklist?.includes(session.userId as string)) {
      msg = '× 验证失败\n该聊天账号位于群黑名单。'
      return { msg, status }
    }

    // 缓存变量
    let userName = options.user,
      qqNumber = options.qq || session.userId?.replace('onebot:', ''),
      encodeNumber = this.qqHashEncode(qqNumber || ''),
      verifyCode: string,
      lastEditor: string

    // 修正用户名：去除首尾空格
    userName = userName.trim()
    // 修正用户名：去除`User:`前缀
    userName = userName.replace(/^user:/i, '')
    // 修正用户名：替换空格
    userName = userName.replace(/[_\s]+/g, ' ')
    // 修正用户名：首字母大写
    userName = userName.slice(0, 1).toUpperCase() + userName.slice(1)

    const { data } = await this.ajax.get('', {
      params: {
        action: 'parse',
        page: `User:${userName}/verify-qq`,
        prop: 'wikitext|revid',
      },
    })

    if (!data?.parse?.revid) {
      msg = `[${segment.at(
        qqNumber as string
      )}↔${userName}] \n× 验证失败\n页面 User:${userName}/verify-qq 不存在！`
      return { msg, status }
    }

    verifyCode = data.parse.wikitext
    if (verifyCode !== encodeNumber) {
      msg = `[${segment.at(
        qqNumber as string
      )}↔${userName}] \n× 验证失败\n保存在wiki中的验证代码与QQ号不匹配。`
      return { msg, status }
    }

    const { data: revs } = await this.ajax.get('', {
      params: {
        action: 'query',
        prop: 'revisions',
        revids: data.parse.revid,
        rvprop: 'user',
      },
    })

    lastEditor = revs.query.pages[0].revisions[0].user

    if (lastEditor === userName) {
      status = true
      msg = `[${segment.at(qqNumber as string)}↔${userName}] \n√ 验证通过！`
    } else {
      msg = `[${segment.at(
        qqNumber as string
      )}↔${userName}] \n× 验证失败\n验证代码的最后编辑者为 ${lastEditor}！`
    }

    return { msg, status }
  }

  qqHashEncode(qq: string) {
    return createHash('md5')
      .update('' + qq)
      .digest('hex')
  }

  get ajax() {
    return axios.create({
      baseURL: 'https://community.fandom.com/zh/api.php',
      params: {
        format: 'json',
        formatversion: '2',
      },
    })
  }

  get logger() {
    return this.ctx.logger('VERIFY_QQ')
  }
}
