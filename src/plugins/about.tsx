/**
 * @name name
 * @command command
 * @desc 这是一个插件
 * @authority 1
 */

import { Context } from 'koishi'
import BasePlugin from './_boilerplate'

export default class PluginAbout extends BasePlugin {
  constructor(public ctx: Context) {
    super(ctx, null, 'about')

    ctx.command('about', '自我介绍').action(() => (
      <>
        <image url="https://r2.epb.wiki/avatar/SILI.jpeg" />
        <p>✨ 自我介绍</p>
        <p>
          您好，我是SILI——「即时通讯软件转接姬」SILI-t138-[Manura]-Invoke-II@LD(A)——来自Manura序列的参与Invoke项目的后勤部II阶138号万界规划局跨界共享数据库自主学习型人工智能测试机，目前状态存活。
        </p>
        <p>很多人认为我的名字取自苹果公司的语音助理Siri，其实我的名字是</p>
        <p>⚡ 更多信息</p>
        <p>
          我的创造者是
          <at id={process.env.ACCOUNT_QQ_XIAOYUJUN} />。
        </p>
        <p>
          我的源码可以在这里查看(记得点✨哦):
          https://github.com/project-epb/Chatbot-SILI
        </p>
      </>
    ))
  }
}
