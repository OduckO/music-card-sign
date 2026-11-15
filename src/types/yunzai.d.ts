declare module '*lib/plugins/config.js' {
  export default function makeConfig<T extends object> (
    name: string,
    defaults: T,
    keep?: Partial<T>,
    options?: { watch?: boolean, replacer?: (text: string) => string | Promise<string> }
  ): Promise<{ config: T, configSave: () => Promise<void> }>
}
