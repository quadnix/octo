import type { IDependency } from './functions/dependency/dependency.js';
import type { ANode } from './functions/node/node.abstract.js';
import type { IAnchor } from './overlays/anchor.interface.js';
import { AOverlay } from './overlays/overlay.abstract.js';
import { AModel } from './models/model.abstract.js';
import type { IModel } from './models/model.interface.js';
import type { IOverlay } from './overlays/overlay.interface.js';
import { AResource } from './resources/resource.abstract.js';
import type { IResource } from './resources/resource.interface.js';
import type { ASharedResource } from './resources/shared-resource.abstract.js';

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

export type ActionInputs = { [key: string]: string | UnknownResource };

export type ActionOutputs = { [key: string]: UnknownResource };

export type Constructable<T> = new (...args: any[]) => T;

export type ModelSerializedOutput = {
  anchors: (IAnchor & { className: string })[];
  dependencies: IDependency[];
  models: { [p: string]: { className: string; model: IUnknownModel } };
  overlays: { className: string; overlay: IOverlay }[];
};

// https://stackoverflow.com/a/55032655/1834562
export type ModifyInterface<T, R> = Omit<T, keyof R> & R;

export type ResourceSerializedOutput = {
  dependencies: IDependency[];
  resources: { [p: string]: { className: string; context: string; resource: IResource } };
  sharedResources: { [p: string]: { className: string; context: string; resource: IResource } };
};

export type TransactionOptions = {
  enableResourceCapture?: boolean;
  yieldModelDiffs?: boolean;
  yieldModelTransaction?: boolean;
  yieldResourceDiffs?: boolean;
  yieldResourceTransaction?: boolean;
};

export type IUnknownModel = IModel<unknown, unknown>;

export type UnknownModel = AModel<unknown, unknown>;

export type UnknownNode = ANode<unknown, unknown>;

export type UnknownOverlay = AOverlay<unknown>;

export type UnknownResource = AResource<unknown>;

export type UnknownSharedResource = ASharedResource<unknown>;

export function isModel(nodeClass: Constructable<UnknownNode>): nodeClass is Constructable<UnknownModel> {
  return nodeClass.prototype instanceof AModel;
}

export function isOverlay(nodeClass: Constructable<UnknownNode>): nodeClass is Constructable<UnknownOverlay> {
  return nodeClass.prototype instanceof AOverlay;
}

export function isResource(nodeClass: Constructable<UnknownNode>): nodeClass is Constructable<UnknownResource> {
  return nodeClass.prototype instanceof AResource;
}
