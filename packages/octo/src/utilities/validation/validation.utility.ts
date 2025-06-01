import { type Constructable, NodeType } from '../../app.type.js';
import { SchemaError, ValidationTransactionError } from '../../errors/index.js';
import { getSchemaInstance } from '../../functions/schema/schema.js';
import { AModel } from '../../models/model.abstract.js';
import type { BaseAnchorSchema } from '../../overlays/anchor.schema.js';
import { AOverlay } from '../../overlays/overlay.abstract.js';
import { AResource } from '../../resources/resource.abstract.js';

export class ValidationUtility {
  static validateCustom(subject: any, customFn: (subject: any) => boolean): boolean {
    if (typeof customFn !== 'function') {
      return false;
    }
    return customFn(subject);
  }

  static validateIsModel(
    subject: any,
    staticProperties: {
      anchors?: { anchorId?: string; schema: Constructable<BaseAnchorSchema> }[];
      NODE_NAME: string;
      NODE_PACKAGE?: string;
    },
  ): boolean {
    const result =
      subject instanceof AModel &&
      (subject.constructor as typeof AModel).NODE_NAME === staticProperties.NODE_NAME &&
      (subject.constructor as typeof AModel).NODE_TYPE === NodeType.MODEL &&
      (staticProperties.NODE_PACKAGE
        ? (subject.constructor as typeof AModel).NODE_PACKAGE === staticProperties.NODE_PACKAGE
        : true);
    if (!result) {
      return false;
    }
    if (!staticProperties.anchors || staticProperties.anchors.length === 0) {
      return true;
    }

    const anchors = subject.getAnchors();
    return staticProperties.anchors.every((anchor) => {
      const { anchorId, schema: anchorSchema } = anchor;

      return anchors.some((anchor) => {
        try {
          getSchemaInstance(anchorSchema, anchor.synth());
          return anchorId ? anchorId === anchor.anchorId : true;
        } catch (error) {
          return false;
        }
      });
    });
  }

  static validateIsOverlay(
    subject: any,
    staticProperties: {
      anchors?: { anchorId?: string; schema: Constructable<BaseAnchorSchema> }[];
      NODE_NAME: string;
      NODE_PACKAGE?: string;
      overlayId?: string;
    },
  ): boolean {
    const result =
      subject instanceof AOverlay &&
      (subject.constructor as typeof AModel).NODE_NAME === staticProperties.NODE_NAME &&
      (subject.constructor as typeof AModel).NODE_TYPE === NodeType.OVERLAY &&
      (staticProperties.NODE_PACKAGE
        ? (subject.constructor as typeof AModel).NODE_PACKAGE === staticProperties.NODE_PACKAGE
        : true) &&
      (staticProperties.overlayId ? subject.overlayId === staticProperties.overlayId : true);
    if (!result) {
      return false;
    }
    if (!staticProperties.anchors || staticProperties.anchors.length === 0) {
      return true;
    }

    const anchors = subject.getAnchors();
    return staticProperties.anchors.every((anchor) => {
      const { anchorId, schema: anchorSchema } = anchor;

      return anchors.some((anchor) => {
        try {
          getSchemaInstance(anchorSchema, anchor.synth());
          return anchorId ? anchorId === anchor.anchorId : true;
        } catch (error) {
          return false;
        }
      });
    });
  }

  static validateIsResource(
    subject: any,
    staticProperties: { NODE_NAME: string; NODE_PACKAGE?: string; resourceId?: string },
  ): boolean {
    return (
      subject instanceof AResource &&
      (subject.constructor as typeof AResource).NODE_NAME === staticProperties.NODE_NAME &&
      (subject.constructor as typeof AResource).NODE_TYPE === NodeType.RESOURCE &&
      (staticProperties.NODE_PACKAGE
        ? (subject.constructor as typeof AResource).NODE_PACKAGE === staticProperties.NODE_PACKAGE
        : true) &&
      (staticProperties.resourceId ? subject.resourceId === staticProperties.resourceId : true)
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
    if (typeof subject === 'boolean') {
      return String(subject).length <= maxLength;
    } else if (typeof subject === 'number') {
      return String(subject).length <= maxLength;
    } else if (typeof subject === 'string') {
      return subject.length <= maxLength;
    } else if (Array.isArray(subject)) {
      return subject.length <= maxLength;
    } else {
      return false;
    }
  }

  static validateMinLength(subject: any, minLength: number): boolean {
    if (typeof subject === 'boolean') {
      return String(subject).length >= minLength;
    } else if (typeof subject === 'number') {
      return String(subject).length >= minLength;
    } else if (typeof subject === 'string') {
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
