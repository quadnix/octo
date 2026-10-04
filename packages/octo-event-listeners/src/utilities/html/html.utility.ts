/**
 * HTML helpers the report pages share.
 *
 * @internal
 */
export class HtmlUtility {
  /**
   * Escapes a value for use as HTML text or an attribute value. `null` and `undefined` become empty.
   *
   * @internal
   */
  static escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
