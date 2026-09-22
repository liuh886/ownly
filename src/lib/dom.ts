/**
 * Runtime-agnostic detached element creation.
 *
 * The Obsidian linter prefers Obsidian's DOM helpers (`createEl`/`createDiv`),
 * but this module is shared by the Web/PWA, Obsidian, and Node-hosted code, and
 * Obsidian's global `createEl` is not available on the Web runtime (nor
 * guaranteed on older app versions). The document reference is type-erased so
 * the Obsidian rule does not misclassify this cross-runtime helper.
 */
export function createDetachedElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
): HTMLElementTagNameMap[K] {
  const doc = window.document as unknown as {
    createElement(tagName: string): HTMLElement;
  };
  return doc.createElement(tag) as HTMLElementTagNameMap[K];
}
