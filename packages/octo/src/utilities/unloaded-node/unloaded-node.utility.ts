import { NodeType, type UnknownAnchor, type UnknownModel, type UnknownNode } from '../../app.type.js';
import { AModel } from '../../models/model.abstract.js';
import { AAnchor } from '../../overlays/anchor.abstract.js';
import { AOverlay } from '../../overlays/overlay.abstract.js';
import { AResource } from '../../resources/resource.abstract.js';

/**
 * Stand-ins for the classes of another app's state that this app does not import, so the state reads
 * without them. A stand-in holds what that app saved and nothing else.
 *
 * @internal
 */
export class UnloadedNodeUtility {
  /**
   * A stand-in for an anchor class.
   */
  static anchorClass(className: string): any {
    return class extends AAnchor<any, UnknownModel> {
      static override readonly NODE_PACKAGE = UnloadedNodeUtility.packageOf(className);
      static readonly UNLOADED_CLASS_NAME = className;

      /**
       * @internal
       */
      constructor(anchorId: string, properties: object, parent: UnknownModel) {
        super(anchorId, properties, parent);
      }
    };
  }

  /**
   * The class a stand-in holds the place of, or `undefined` for a loaded node.
   */
  static getUnloadedClassName(node: UnknownNode | UnknownAnchor): string | undefined {
    return (node.constructor as { UNLOADED_CLASS_NAME?: string }).UNLOADED_CLASS_NAME;
  }

  /**
   * A stand-in for a model class.
   */
  static modelClass(className: string, nodeName: string): any {
    return class extends AModel<any, any> {
      static override readonly NODE_NAME = nodeName;
      static override readonly NODE_PACKAGE = UnloadedNodeUtility.packageOf(className);
      static override readonly NODE_TYPE = NodeType.MODEL;
      static readonly UNLOADED_CLASS_NAME = className;

      /**
       * @internal
       */
      constructor(private readonly saved: object) {
        super();
      }

      /**
       * @internal
       */
      static override async unSynth(model: object): Promise<UnknownModel> {
        return new this(model);
      }

      /**
       * @internal
       */
      override setContext(): string | undefined {
        return undefined;
      }

      /**
       * @internal
       */
      override synth(): any {
        return JSON.parse(JSON.stringify(this.saved));
      }
    };
  }

  /**
   * A stand-in for an overlay class.
   */
  static overlayClass(className: string, nodeName: string): any {
    return class extends AOverlay<any, any> {
      static override readonly NODE_NAME = nodeName;
      static override readonly NODE_PACKAGE = UnloadedNodeUtility.packageOf(className);
      static override readonly NODE_TYPE = NodeType.OVERLAY;
      static readonly UNLOADED_CLASS_NAME = className;

      /**
       * @internal
       */
      constructor(overlayId: string, properties: object, anchors: UnknownAnchor[]) {
        super(overlayId, properties, anchors);
      }
    };
  }

  /**
   * A stand-in for a resource class.
   */
  static resourceClass(className: string, nodeName: string): any {
    return class extends AResource<any, any> {
      static override readonly NODE_NAME = nodeName;
      static override readonly NODE_PACKAGE = UnloadedNodeUtility.packageOf(className);
      static override readonly NODE_TYPE = NodeType.RESOURCE;
      static readonly UNLOADED_CLASS_NAME = className;

      /**
       * @internal
       */
      constructor(localResourceId: string, properties: object, parents: UnknownNode[]) {
        super(localResourceId, properties, parents as any);
      }
    };
  }

  /**
   * The package part of a class name such as `@quadnix/octo-aws-cdk/AwsRegion`.
   */
  private static packageOf(className: string): string {
    return className.slice(0, className.lastIndexOf('/'));
  }
}
