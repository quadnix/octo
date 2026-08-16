/**
 * @internal
 */
export class PolicyUtility {
  /**
   * @internal
   */
  static getSafeSid(subject: string): string {
    return subject.replace(new RegExp(/[^0-9A-Za-z]/, 'ig'), '');
  }
}
