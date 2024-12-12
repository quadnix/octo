import { NodeType } from '../../app.type.js';
import { AResource } from '../../resources/resource.abstract.js';

export class ValidationUtility {
  static validateIsResource(subject: any, staticProperties: { NODE_NAME: string; NODE_PACKAGE?: string }): boolean {
    return subject instanceof AResource &&
      (subject.constructor as typeof AResource).NODE_NAME === staticProperties.NODE_NAME &&
      (subject.constructor as typeof AResource).NODE_TYPE === NodeType.RESOURCE &&
      staticProperties.NODE_PACKAGE
      ? (subject.constructor as typeof AResource).NODE_PACKAGE === staticProperties.NODE_PACKAGE
      : true;
  }

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
