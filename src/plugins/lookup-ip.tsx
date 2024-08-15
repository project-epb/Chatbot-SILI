import { Context, Service } from 'koishi'

import BasePlugin from './_boilerplate'

export interface Config {
  ipgeoApiKey: string
}

export class PluginLookupIP extends BasePlugin {
  constructor(ctx: Context, config: Config) {
    super(ctx, config, 'check-ip')
    this.init()
  }

  private init() {
    // install service
    this.ctx.plugin(GeoIPService, this.config)
    // do init
    this.ctx.inject(['ipgeo'], () => {
      this.initCommands()
    })
  }
  private initCommands() {
    this.ctx
      .command('lookup-ip <ip>', '查询 IP 地址信息', { maxUsage: 30 })
      .check(({ session }, ip) => {
        if (!this.ctx.geoip.validateIP(ip)) {
          return '请输入正确的 IP 地址。'
        }
      })
      .action(async ({ session }, ip) => {
        try {
          const info = await this.ctx.geoip.lookupIP(ip)
          return (
            <>
              <p>IP 地址：{info.ip}</p>
              <p>
                地理位置：
                {[info.city, info.district, info.state_prov, info.country_name]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              <p>ISP：{info.isp}</p>
              <p>ASN：{info.asn}</p>
              <p>组织：{info.organization}</p>
              <p>
                时区：
                {info.time_zone.offset === 0
                  ? 'UTC'
                  : `UTC${info.time_zone.offset > 0 ? '+' : ''}${info.time_zone.offset}`}
              </p>
            </>
          )
        } catch (e) {
          if (e.response) {
            switch (e.response.status) {
              case 403:
                return 'API Key 无效。'
              case 429:
                return '请求次数过多，请稍后再试。'
              default:
                return `查询时遇到问题：${JSON.stringify(e.response.data)}`
            }
          } else {
            return `查询时遇到问题：${e}`
          }
        }
      })
  }
}

export interface IPGeoInfo {
  ip: string
  hostname: string
  continent_code: string
  continent_name: string
  country_code2: string
  country_code3: string
  country_name: string
  country_capital: string
  state_prov: string
  district: string
  city: string
  zipcode: string
  latitude: string
  longitude: string
  is_eu: boolean
  calling_code: string
  country_tld: string
  languages: string
  country_flag: string
  geoname_id: string
  isp: string
  connection_type: string
  organization: string
  asn: string
  currency?: IPGeoCurrency
  time_zone?: IPGeoTimeZone
}
export interface IPGeoCurrency {
  code: string
  name: string
  symbol: string
}
export interface IPGeoTimeZone {
  name: string
  offset: number
  current_time: string
  current_time_unix: number
  is_dst: boolean
  dst_savings: number
}

declare module 'koishi' {
  interface Context {
    geoip: GeoIPService
  }
}

export class GeoIPService extends Service {
  constructor(
    public ctx: Context,
    public config: Config
  ) {
    super(ctx, 'geoip', {
      immediate: true,
    })
  }

  lookupIP(ip?: string) {
    return this.ctx.http.get<IPGeoInfo>('https://api.ipgeolocation.io/ipgeo', {
      params: {
        apiKey: this.config.ipgeoApiKey,
        ip,
      },
    })
  }

  validateIPV4(ip: string) {
    return ip.match(
      /^((25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(25[0-5]|2[0-4]\d|[01]?\d{1,2})$/
    )
  }
  validateIPV6(ip: string) {
    return ip.match(/^([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:)$/)
  }
  validateIP(ip: string) {
    return this.validateIPV4(ip) || this.validateIPV6(ip)
  }
}
