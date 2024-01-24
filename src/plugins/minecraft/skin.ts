import { Context, Service, h } from 'koishi'

import { Fexios } from 'fexios'

import BasePlugin from '../_boilerplate'

export interface MinecraftSkinModifiers {
  size?: number
  scale?: number
  overlay?: boolean
  default?: 'MHF_Steve' | 'MHF_Alex'
}

export class PluginMinecraftSkin extends BasePlugin {
  static inject = ['mojang']

  constructor(
    public ctx: Context,
    options: any
  ) {
    super(ctx, options, 'minecraft-skin')
    ctx.plugin(MinecraftSkinService)

    ctx
      .command('minecraft.skin <uuid:string>', '获取 Minecraft 皮肤')
      .option('avatar', '-a 获取头像')
      .option('body', '-b 获取全身', { fallback: true })
      .option('head', '-h 获取头部')
      .option('skins', '-s 获取皮肤贴图')
      .option('capes', '-c 获取披风贴图')
      .action(async ({ session, options }, uuid) => {
        if (!uuid) {
          await session.send('请发送要查询的玩家名或 UUID')
          uuid = await session.prompt(10 * 1000)
          if (!uuid) return
        }
        if (!ctx.mojang.isValidUuid(uuid)) {
          uuid = await ctx.mojang.gerUuidByName(uuid).then(({ id }) => id)
        }
        if (!uuid) {
          return '未找到玩家'
        }
        const required = Object.keys(options).filter((key) => options[key])
        return required
          .map((key) =>
            h.image(
              ctx.minecraft_skin.assetUrl(key as any, uuid, { overlay: true })
            )
          )
          .join('\n')
      })
  }
}

declare module 'koishi' {
  interface Context {
    minecraft_skin: MinecraftSkinService
  }
}
export class MinecraftSkinService extends Service {
  private readonly request = new Fexios({
    baseURL: 'https://crafatar.com/',
  })

  constructor(ctx: Context) {
    super(ctx, 'minecraft_skin')
  }

  assetUrl(
    type: 'avatar' | 'body' | 'head' | 'skins' | 'capes',
    uuid: string,
    modifiers: MinecraftSkinModifiers = {}
  ) {
    const url = new URL('https://crafatar.com/')
    switch (type) {
      case 'avatar':
        url.pathname = `/avatars/${uuid}`
        break
      case 'body':
        url.pathname = `/renders/body/${uuid}`
        break
      case 'head':
        url.pathname = `/renders/head/${uuid}`
        break
      case 'skins':
        url.pathname = `/skins/${uuid}`
        break
      case 'capes':
        url.pathname = `/capes/${uuid}`
        break
    }
    url.searchParams.set('size', modifiers.size?.toString() ?? '128')
    url.searchParams.set('scale', modifiers.scale?.toString() ?? '10')
    !!modifiers.overlay && url.searchParams.set('overlay', 'true')
    !!modifiers.default && url.searchParams.set('default', modifiers.default)
    return url.href
  }

  async avatar(
    uuid: string,
    modifiers: Pick<MinecraftSkinModifiers, 'size' | 'overlay' | 'default'> = {}
  ) {
    return this.request
      .get<Blob>(`/avatars/${uuid}`, { responseType: 'blob', query: modifiers })
      .then(({ data }) => data)
  }

  async body(
    uuid: string,
    modifiers: Pick<
      MinecraftSkinModifiers,
      'scale' | 'overlay' | 'default'
    > = {}
  ) {
    return this.request
      .get<Blob>(`/renders/body/${uuid}`, {
        responseType: 'blob',
        query: modifiers,
      })
      .then(({ data }) => data)
  }

  async head(
    uuid: string,
    modifiers: Pick<
      MinecraftSkinModifiers,
      'scale' | 'overlay' | 'default'
    > = {}
  ) {
    return this.request
      .get<Blob>(`/renders/head/${uuid}`, {
        responseType: 'blob',
        query: modifiers,
      })
      .then(({ data }) => data)
  }

  async skins(
    uuid: string,
    modifiers: Pick<MinecraftSkinModifiers, 'default'> = {}
  ) {
    return this.request
      .get<Blob>(`/skins/${uuid}`, { responseType: 'blob', query: modifiers })
      .then(({ data }) => data)
  }

  async capes(
    uuid: string,
    modifiers: Pick<MinecraftSkinModifiers, 'default'> = {}
  ) {
    return this.request
      .get<Blob>(`/capes/${uuid}`, { responseType: 'blob', query: modifiers })
      .then(({ data }) => data)
  }
}
