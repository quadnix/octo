import { createHash } from 'crypto';

/**
 * @internal
 */
export class CommonUtility {
  /**
   * @internal
   */
  static hash(...args: string[]): string {
    let hash = createHash('sha1');
    for (const arg of args) {
      hash = hash.update(arg);
    }
    return hash.digest('hex');
  }

  /**
   * @internal
   */
  static randomToken(size: number): string {
    // eslint-disable-next-line spellcheck/spell-checker
    const possible = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let text = '';

    for (let i = 0; i < size; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
  }
}
