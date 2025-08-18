/**
 */
import { Context, Service, Session, h } from 'koishi'

import '@koishijs/plugin-adapter-kook'

import OneBotBot, { OneBot } from 'koishi-plugin-adapter-onebot'

import { getUserNickFromSession } from '$utils/formatSession'

import { Config } from '..'

// 群聊消息记录类型 - 用于持久化存储
interface ChannelMessageRecord {
  userName: string
  userId: string
  content: string
  timestamp: number
  channelId: string
  platform: string
  messageId?: string
  type?: string
}

/**{
                "self_id": 721011692,
                "user_id": 721011692,
                "time": 1729603046,
                "message_id": 1170696403,
                "real_id": 1170696403,
                "message_seq": 1170696403,
                "message_type": "group",
                "sender": {
                    "user_id": 721011692,
                    "nickname": "--",
                    "card": "",
                    "role": "owner",
                    "title": ""
                },
                "raw_message": "[CQ:image,file=A507E29F9F727D689AE43A575A6B74A0.png,subType=0,url=https://multimedia.nt.qq.com.cn/download?appid=1407&amp;fileid=EhQSdGwB1zdTx3vOFHPIk4LH5klh7hj1lTUg_woowbaBuYmiiQMyBHByb2RQgL2jAVoQpNtWwVRr3APaJXD4AV4i-A&amp;spec=0&amp;rkey=CAMSKMa3OFokB_TlF7FTUNo885mvsACBYlQMuIeT35gwt0_yutJf2r5AaUQ,file_size=871157]",
                "font": 14,
                "sub_type": "normal",
                "message": [
                    {
                        "type": "image",
                        "data": {
                            "file": "A507E29F9F727D689AE43A575A6B74A0.png",
                            "subType": 0,
                            "url": "https://multimedia.nt.qq.com.cn/download?appid=1407&fileid=EhQSdGwB1zdTx3vOFHPIk4LH5klh7hj1lTUg_woowbaBuYmiiQMyBHByb2RQgL2jAVoQpNtWwVRr3APaJXD4AV4i-A&spec=0&rkey=CAMSKMa3OFokB_TlF7FTUNo885mvsACBYlQMuIeT35gwt0_yutJf2r5AaUQ",
                            "file_size": "871157"
                        }
                    }
                ],
                "message_format": "array",
                "post_type": "message_sent",
                "group_id": 860105388
            } */
interface OneBotMessage {
  self_id: number
  user_id: number
  time: number
  message_id: number
  real_id: number
  message_seq: number
  message_type: string
  sender: {
    user_id: number
    nickname: string
    card: string
    role: string
  }
  raw_message: string
  font: number
  sub_type: string
  message: any[]
  message_format: string
  post_type: string
  group_id: number
}

declare module 'koishi' {
  interface Context {
    messageRecord: MessageRecordService
  }
}

export class MessageRecordService extends Service {
  private readonly NO_RECORD_MAGIC_WORDS = ['[summary]', '[no-record]']

  constructor(
    public ctx: Context,
    public config: Config
  ) {
    super(ctx, 'messageRecord', false)
    this.ctx = ctx.platform('onebot')
  }

  public async start() {
    await this.#initCommands()
  }

  /**
   * 初始化测试命令
   */
  #initCommands() {
    this.ctx.command('message-record', '消息记录', {
      authority: 2,
      hidden: true,
    })
    this.ctx.inject(['html'], (ctx) => {
      ctx
        .command('message-record.debug', '获取消息记录调试信息', {
          authority: 2,
        })
        .action(async ({ session }) => {
          const records = await this.getRecordsByChannelId(session.channelId, 5)
          const buf = await ctx.html.shiki(
            JSON.stringify(records, null, 2),
            'json'
          )
          return h.img(buf, 'image/png')
        })
    })
  }

  get onebot() {
    return this.ctx.bots.find(
      (bot) => bot.platform === 'onebot'
    ) as unknown as OneBotBot<Context>
  }

  /**
   * 根据频道ID获取消息记录
   */
  async getRecordsByChannelId(
    channelId: string,
    count = this.config.recordsPerChannel
  ): Promise<ChannelMessageRecord[]> {
    const history = await this.onebot.internal._request(
      'get_group_msg_history',
      {
        group_id: channelId,
        count,
      }
    )
    const messages = (
      await Promise.all(
        (history.data.messages as any[]).map((i) =>
          OneBot.adaptMessage(this.onebot, i)
        )
      )
    )
      .map(
        (i) =>
          ({
            userName: i.user.name || '',
            userId: i.user.id || '',
            content: i.content || '',
            timestamp: i.timestamp || 0,
            channelId: i.channel.id || '',
            platform: 'onebot',
            messageId: i.id || '',
            type: 'message',
          }) as ChannelMessageRecord
      )
      .filter(
        (i) => i.content && !this.NO_RECORD_MAGIC_WORDS.includes(i.content)
      )
    return messages
  }

  /**
   * 格式化消息记录为可读格式（保持向后兼容）
   */
  convertSessionToRecord(session: Session): ChannelMessageRecord {
    return {
      userName: getUserNickFromSession(session),
      userId: session.userId || '',
      content: session?.content || session.elements?.join('') || '',
      timestamp: session.timestamp,
      channelId: session.channelId,
      platform: session.platform,
      messageId: session.messageId,
      type: session.type,
    }
  }

  // @ts-ignore
  get logger() {
    return this.ctx.logger('MessageRecord')
  }
}
