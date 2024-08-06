export class ValidationUtility {
  static validateMaxLength(subject: string, maxLength: number): boolean {
    return subject.length <= maxLength;
  }

  static validateMinLength(subject: string, minLength: number): boolean {
    return subject.length >= minLength;
  }

  static validateRegex(subject: string, pattern: RegExp): boolean {
    return pattern.test(subject);
  }
}
