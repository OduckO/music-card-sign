// 此文件由 @karinjs/template-react 自动生成，请不要手动修改。
import type { DataOf, RenderContextInput, RendererOptions, RenderResult } from '@karinjs/template-react'

interface TemplateRegistry {
  'music/help': typeof import('../../ktr/template/music/help/index').default
  'music/overview': typeof import('../../ktr/template/music/overview/index').default
}

export type TemplatePath = keyof TemplateRegistry & string
export type TemplateDataMap = {
  [K in TemplatePath]: DataOf<TemplateRegistry[K]>
}
export type TemplateData<K extends TemplatePath> = TemplateDataMap[K]
export type StandaloneRendererOptions = Omit<Partial<RendererOptions>, 'cssPath' | 'cssText'>
export type TemplateRenderFn = <K extends TemplatePath>(
  templatePath: K,
  data: TemplateData<K>,
  ctx?: RenderContextInput
) => Promise<RenderResult>

export declare const createTemplateRenderer: (options?: StandaloneRendererOptions) => TemplateRenderFn
export declare const renderTemplate: TemplateRenderFn
