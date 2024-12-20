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

/* Enumerations */
export enum NodeType {
  MODEL = 'model',
  OVERLAY = 'overlay',
  RESOURCE = 'resource',
  SHARED_RESOURCE = 'shared-resource',
}

export enum ValidationType {
  MAX_LENGTH = 'maxLength',
  MIN_LENGTH = 'minLength',
  REGEX = 'regex',
}

/* Types */
export type ActionInputs = EnhancedModuleSchema<UnknownModule>;
export type ActionOutputs = { [key: string]: UnknownResource };

export type ClassRequiredProperties<T> = {
  [K in keyof T]: undefined extends T[K] ? never : K;
}[keyof T];
export type ClassOptionalProperties<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

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
  inputs: Record<keyof ModuleSchemaInputs<T>, unknown>;
  models: Record<string, UnknownModel>;
  overlays: Record<string, UnknownOverlay>;
  resources: Record<string, UnknownResource>;
};
export type ModelSchema<T> = T extends AModel<infer S, any> ? S : never;
export type ModuleOutput<M> = M extends AModule<any, infer T> ? T : never;
export type ModuleSchema<T> = T extends AModule<infer S, any> ? S : never;
export type ModuleSchemaInputs<T> = { [K in ClassRequiredProperties<ModuleSchema<T>>]: string } & {
  [K in ClassOptionalProperties<ModuleSchema<T>>]?: string;
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
