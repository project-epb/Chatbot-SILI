import BasePlugin from './_boilerplate'
import { Context } from 'koishi'
import { resolve } from 'path'

enum FilePath {
  dumpScript = './scripts/db_dump.ps1',
}

export default class PluginDatabaseAdmin extends BasePlugin {
  static using = ['shell', 'html']

  constructor(public ctx: Context) {
    super(ctx, {}, 'dbadmin')

    const command = ctx.command('admin/dbadmin', '数据库管理', { authority: 3 })

    command.subcommand('dump', '备份数据库').action(async ({ session }) => {
      const script = resolve(ctx.baseDir, FilePath.dumpScript)
      const { code, output } = await ctx.root.shell.exec(`pwsh ${script}`)
      return code === 0 ? '数据库备份完毕！' : '数据库备份失败。'
    })

    command
      .subcommand(
        'get',
        '<table:string> <query:string> [fields:string] 查询数据库'
      )
      .example('dbadmin get table_name foo=bar&baz=qux foo,bar')
      .action(async ({ session }, table, queryRaw, fieldsRaw) => {
        if (!table || !queryRaw) return session.execute('dbadmin get -h')
        const query = Object.fromEntries(
          new URLSearchParams(queryRaw).entries()
        )
        const fields = fieldsRaw ? fieldsRaw.split(',') : undefined
        const res = await session.app.database.get(table as any, query, {
          fields,
          limit: 1,
        })
        const img = await ctx.html.hljs(JSON.stringify(res, null, 2), 'json')
        return img ? img : '出现了一些问题'
      })

    command
      .subcommand(
        'set',
        '<table:string> <where:string> <update:string> 更新数据库'
      )
      .action(async ({ session }, table, whereRaw, updateRaw) => {
        if (!table || !whereRaw) return session.execute('dbadmin set -h')
        const where = Object.fromEntries(
          new URLSearchParams(whereRaw).entries()
        )
        const update = Object.fromEntries(
          new URLSearchParams(updateRaw).entries()
        )
        const res = await session.app.database.set(table as any, where, update)
        const img = await ctx.html.hljs(JSON.stringify(res, null, 2), 'json')
        return img ? img : '出现了一些问题'
      })
  }
}
