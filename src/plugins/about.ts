/**
 * @name name
 * @command command
 * @desc 这是一个插件
 * @authority 1
 */

import { Context, segment } from 'koishi'

export default class PluginAbout {
  constructor(public ctx: Context) {
    ctx.command('about').action(() => {
      return [
        segment.image('https://i.loli.net/2021/02/19/nPzM8qvmyGBI2aL.jpg'),
        '✨ 自我介绍',
        '您好，我是SILI——「即时通讯软件转接姬」SILI-t137-[Tumita]-Invoke-II@LD(A)——来自Tumita序列的参与Invoke项目的后勤部II阶137号万界规划局跨界共享数据库自主学习型人工智能测试机，目前状态存活。',
        '很多人认为我的名字取自苹果公司的语音助理Siri，其实是出自单词silly，意思是笨蛋。',
        '⚡ 更多信息',
        '我的创造者是' + segment.at(process.env.ACCOUNT_QQ_XIAOYUJUN as string),
        '我的源码可以在这里查看(记得点✨哦): https://github.com/Wjghj-Project/Chatbot-SILI-v4',
      ].join('\n')
    })
  }

  get logger() {
    return this.ctx.logger('ABOUT')
  }
}
