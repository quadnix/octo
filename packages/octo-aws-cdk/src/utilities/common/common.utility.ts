import { createHash } from 'crypto';

export class CommonUtility {
  static hash(string: string): string {
    return createHash('sha1').update(string).digest('hex');
  }

  static randomToken(size: number): string {
    const possible = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let text = '';

    for (let i = 0; i < size; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
  }
}
