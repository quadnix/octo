import { type Constructable, NodeType } from '../../app.type.js';
import { SchemaError, ValidationTransactionError } from '../../errors/index.js';
import { getSchemaInstance } from '../../functions/schema/schema.js';
import { AModel } from '../../models/model.abstract.js';
import { AResource } from '../../resources/resource.abstract.js';

export class ValidationUtility {
  static validateIsModel(subject: any, staticProperties: { NODE_NAME: string; NODE_PACKAGE?: string }): boolean {
    return (
      subject instanceof AModel &&
      (subject.constructor as typeof AModel).NODE_NAME === staticProperties.NODE_NAME &&
      (subject.constructor as typeof AModel).NODE_TYPE === NodeType.MODEL &&
      (staticProperties.NODE_PACKAGE
        ? (subject.constructor as typeof AModel).NODE_PACKAGE === staticProperties.NODE_PACKAGE
        : true)
    );
  }

  static validateIsResource(subject: any, staticProperties: { NODE_NAME: string; NODE_PACKAGE?: string }): boolean {
    return (
      subject instanceof AResource &&
      (subject.constructor as typeof AResource).NODE_NAME === staticProperties.NODE_NAME &&
      (subject.constructor as typeof AResource).NODE_TYPE === NodeType.RESOURCE &&
      (staticProperties.NODE_PACKAGE
        ? (subject.constructor as typeof AResource).NODE_PACKAGE === staticProperties.NODE_PACKAGE
        : true)
    );
  }

  static validateIsSchema(subject: any, staticProperties: { schema: Constructable<any> }): boolean {
    try {
      getSchemaInstance(staticProperties.schema, subject);
      return true;
    } catch (error) {
      if (error instanceof SchemaError || error instanceof ValidationTransactionError) {
        return false;
      }
      throw error;
    }
  }

  static validateMaxLength(subject: any, maxLength: number): boolean {
    if (typeof subject === 'string') {
      return subject.length <= maxLength;
    } else if (Array.isArray(subject)) {
      return subject.length <= maxLength;
    } else {
      return false;
    }
  }

  static validateMinLength(subject: any, minLength: number): boolean {
    if (typeof subject === 'string') {
      return subject.length >= minLength;
    } else if (Array.isArray(subject)) {
      return subject.length >= minLength;
    } else {
      return false;
    }
  }

  static validateRegex(subject: any, pattern: RegExp): boolean {
    if (typeof subject !== 'string') {
      return false;
    }
    return pattern.test(subject);
  }
}
