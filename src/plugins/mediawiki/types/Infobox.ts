export interface InfoboxDefinition {
  match: (url: URL) => boolean | string
  selector: string | string[]
  injectStyles?: string
  skin?: string
}
