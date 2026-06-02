/**
 * @internal
 */
export class PolicyUtility {
  static getSafeSid(subject: string): string {
    return subject.replace(new RegExp(/[^0-9A-Za-z]/, 'ig'), '');
  }
}
