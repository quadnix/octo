import type { IDependency } from './functions/dependency/dependency.js';
import type { ANode } from './functions/node/node.abstract.js';
import type { IModelAction } from './models/model-action.interface.js';
import type { AModel } from './models/model.abstract.js';
import type { IModel } from './models/model.interface.js';
import type { AModule } from './modules/module.abstract.js';
import type { AAnchor } from './overlays/anchor.abstract.js';
import type { BaseAnchorSchema } from './overlays/anchor.schema.js';
import type { AOverlay } from './overlays/overlay.abstract.js';
import type { BaseOverlaySchema } from './overlays/overlay.schema.js';
import type { IResourceAction } from './resources/resource-action.interface.js';
import type { AResource } from './resources/resource.abstract.js';
import type { BaseResourceSchema } from './resources/resource.schema.js';
import type { ASharedResource } from './resources/shared-resource.abstract.js';
import type { ValidationUtility } from './utilities/validation/validation.utility.js';

/* Enumerations */
export enum NodeType {
  MODEL = 'model',
  OVERLAY = 'overlay',
  RESOURCE = 'resource',
  SHARED_RESOURCE = 'shared-resource',
}

export enum ValidationType {
  IS_MODEL = 'isModel',
  IS_RESOURCE = 'isResource',
  IS_SCHEMA = 'isSchema',
  MAX_LENGTH = 'maxLength',
  MIN_LENGTH = 'minLength',
  REGEX = 'regex',
}

export function stub<T>(value: string): T {
  return value as T;
}

export type ValidationTypeOptions = {
  [ValidationType.IS_MODEL]: Parameters<typeof ValidationUtility.validateIsModel>[1];
  [ValidationType.IS_RESOURCE]: Parameters<typeof ValidationUtility.validateIsResource>[1];
  [ValidationType.IS_SCHEMA]: Parameters<typeof ValidationUtility.validateIsSchema>[1];
  [ValidationType.MAX_LENGTH]: Parameters<typeof ValidationUtility.validateMaxLength>[1];
  [ValidationType.MIN_LENGTH]: Parameters<typeof ValidationUtility.validateMinLength>[1];
  [ValidationType.REGEX]: Parameters<typeof ValidationUtility.validateRegex>[1];
};

/* Types */
export type ActionInputs = EnhancedModuleSchema<UnknownModule>;
export type ActionOutputs = { [key: string]: UnknownResource };

export type ClassRequiredProperties<T> = {
  [K in keyof T]: undefined extends T[K] ? never : K;
}[keyof T];
export type ClassOptionalProperties<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

export type ObjectKeyValue<T> = { [K in keyof T]: { key: K; value: T[K] } }[keyof T];

export type Constructable<T> = new (...args: any[]) => T;

export type ModelSerializedOutput = {
  anchors: (AnchorSchema<UnknownAnchor> & { className: string })[];
  dependencies: IDependency[];
  models: { [p: string]: { className: string; model: IUnknownModel } };
  overlays: { className: string; overlay: OverlaySchema<UnknownOverlay> }[];
};
export type ResourceSerializedOutput = {
  dependencies: IDependency[];
  resources: { [p: string]: { className: string; context: string; resource: BaseResourceSchema } };
  sharedResources: { [p: string]: { className: string; context: string; resource: BaseResourceSchema } };
};
export type TransactionOptions = {
  enableResourceCapture?: boolean;
  yieldModelDiffs?: boolean;
  yieldModelTransaction?: boolean;
  yieldResourceDiffs?: boolean;
  yieldResourceTransaction?: boolean;
};

// https://stackoverflow.com/a/55032655/1834562
export type ModifyInterface<T, R> = Omit<T, keyof R> & R;

export type AnchorSchema<T> = T extends AAnchor<infer S, any> ? S : never;
export type EnhancedModuleSchema<T> = {
  inputs: { [K in keyof ModuleSchemaInputs<T>]: ModuleSchema<T>[K] };
  models: Record<string, UnknownModel>;
  overlays: Record<string, UnknownOverlay>;
  resources: Record<string, UnknownResource>;
};
export type ModelSchema<T> = T extends AModel<infer S, any> ? S : never;
export type ModuleOutput<M> = M extends AModule<any, infer T> ? T : never;
export type ModuleSchema<T> = T extends AModule<infer S, any> ? S : never;
export type ModuleSchemaInputs<T> = { [K in ClassRequiredProperties<ModuleSchema<T>>]: ModuleSchema<T>[K] } & {
  [K in ClassOptionalProperties<ModuleSchema<T>>]?: ModuleSchema<T>[K];
};
export type NodeSchema<T> = T extends ANode<infer S, any> ? S : never;
export type OverlaySchema<T> = T extends AOverlay<infer S, any> ? S : never;
export type ResourceSchema<T> = T extends AResource<infer S, any> ? S : never;

export type IUnknownModel = IModel<unknown, any>;
export type IUnknownModelAction = IModelAction<any>;
export type IUnknownResourceAction = IResourceAction<any>;
export type UnknownAnchor = AAnchor<BaseAnchorSchema, UnknownModel>;
export type UnknownModel = AModel<unknown, any>;
export type UnknownModule = AModule<unknown, any>;
export type UnknownNode = ANode<unknown, unknown>;
export type UnknownOverlay = AOverlay<BaseOverlaySchema, any>;
export type UnknownResource = AResource<any, any>;
export type UnknownSharedResource = ASharedResource<any, any>;
