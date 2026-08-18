/** Copy dictionaries for the structured-output settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  nav: '结构化输出工具',
  title: '结构化输出工具',
  intro: '选择哪些 Agent 预设（模式）向模型暴露 StructuredOutput 工具和 /json-schema 命令。未开启的模式完全看不到这两个入口；设置仅对之后新建的会话生效。',
  loading: '正在读取设置…',
  presetsLoading: '正在读取 Agent 预设…',
  presetsError: '暂时无法读取 Agent 预设。',
  unavailable: '无法读取结构化输出设置。',
  enable: '在 {name} 中启用',
  defaultPreset: '默认',
  brokenPreset: '该预设不可用',
} as const

/** English dictionary checked against the Chinese key set. */
export const en = {
  nav: 'Structured output',
  title: 'Structured output',
  intro: 'Choose which agent presets (modes) expose the StructuredOutput tool and the /json-schema command. Disabled modes see neither surface; changes apply only to sessions created afterwards.',
  loading: 'Reading settings…',
  presetsLoading: 'Reading agent presets…',
  presetsError: 'Agent presets are temporarily unavailable.',
  unavailable: 'Structured output settings are unavailable.',
  enable: 'Enable in {name}',
  defaultPreset: 'Default',
  brokenPreset: 'Preset unavailable',
} satisfies Record<keyof typeof zh, string>

export type StructuredOutputLocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'structured-output': StructuredOutputLocaleKey
  }
}
