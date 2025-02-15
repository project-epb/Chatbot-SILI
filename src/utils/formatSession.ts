/**
 * 鬼知道为什么不同的适配器返回的结果都不一样
 * 增加一些鲁棒性
 */
import { Fragment, Session } from 'koishi'

export function getUserIdFromSession(session: any): string {
  // @ts-ignore
  return session.userId || session.member?.id || session.user?.id
}
export function getUserNickFromSession(session: any): string {
  // @ts-ignore
  return (
    session.username ||
    session.member?.nick ||
    session.user?.name ||
    getUserIdFromSession(session)
  )
}

export function getChannelIdFromSession(session: any): string {
  // @ts-ignore
  return session.channelId || session.channel?.id
}
export function getChannelNameFromSession(session: any): string {
  // @ts-ignore
  return (
    session.channel?.name ||
    session.guild?.name ||
    getChannelIdFromSession(session)
  )
}

export function getGuildIdFromSession(session: any): string {
  // @ts-ignore
  return session.guildId || session.guild?.id
}
export function getGuildNameFromSession(session: any): string {
  // @ts-ignore
  return session.guild?.name || getChannelNameFromSession(session)
}

export async function sendMessageBySession(
  session: Session,
  message: Fragment,
  options?: any
) {
  return session.bot.sendMessage(
    getChannelIdFromSession(session),
    message,
    getGuildIdFromSession(session),
    options
  )
}
