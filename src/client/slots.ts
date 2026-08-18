/**
 * Local SlotMap declaration for the settings section seat this plugin
 * occupies. The owning package declares the seat at runtime; this file is
 * type-only and covers typechecking when the installed owner typings resolve
 * through a different package tree than the runtime's ui-slots copy. When the
 * same physical copy declares it, the duplicate property is ignored below.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    // @ts-ignore - duplicate declaration is expected and harmless when the
    // installed ui-settings typings already declare the same seat.
    'settings.section': {
      kind: 'list'
      scope: 'root'
      owner: { close: () => void }
    }
  }
}

export {}
