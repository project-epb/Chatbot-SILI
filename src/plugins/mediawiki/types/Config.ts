import { InfoboxDefinition } from './Infobox'

export interface Config {
  cmdAuthWiki: number
  cmdAuthConnect: number
  cmdAuthSearch: number
  searchIfNotExist: boolean
  showDetailsByDefault: boolean
  customInfoboxes: InfoboxDefinition[]
}
