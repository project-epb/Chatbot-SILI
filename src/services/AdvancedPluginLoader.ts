import { Context, Service } from 'koishi'
import {
  isPackageExists,
  importModule,
  getPackageInfo,
  PackageInfo,
} from 'local-pkg'

declare module 'koishi' {
  interface Context {
    apl: AdvancedPluginLoader
    advancedPluginLoader: AdvancedPluginLoader
  }
}

export class AdvancedPluginLoader extends Service {
  constructor(public ctx: Context) {
    super(ctx, 'advancedPluginLoader')
    this.ctx.root.provide('apl')
    this.ctx.root.apl = this
  }

  async findNpmPluginInfo(name: string): Promise<PackageInfo | undefined> {
    const nameList = [name, `@koishijs/plugin-${name}`, `koishi-plugin-${name}`]
    for (const name of nameList) {
      const isExist = isPackageExists(name)
      if (!isExist) {
        continue
      }
      return getPackageInfo(name)
    }
  }
  async getNpmPluginMain<T = any>(name: string): Promise<T | undefined> {
    const info = await this.findNpmPluginInfo(name)
    if (!info) {
      return
    }
    const module = await importModule(name)
    if (!module) {
      return
    }
    return module?.default || module
  }
  async npmPlugin<T = any>(name: string, options?: any) {
    const main = await this.getNpmPluginMain(name)
    if (!main) {
      return
    }
    return this.ctx.plugin(main, options)
  }

  async findLocalPluginPath(name: string) {}
  async localPlugin(name: string, options?: any) {}
}
