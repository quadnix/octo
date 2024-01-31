import { IDependency } from './functions/dependency/dependency.model.js';
import { IModule } from './functions/module/module.interface.js';
import { IAnchor } from './overlay/anchor.interface.js';
import { AOverlay } from './overlay/overlay.abstract.js';
import { AModel } from './models/model.abstract.js';
import { IModel } from './models/model.interface.js';
import { IOverlay } from './overlay/overlay.interface.js';
import { AResource } from './resources/resource.abstract.js';
import { IResource } from './resources/resource.interface.js';
import { ASharedResource } from './resources/shared-resource.abstract.js';

export enum ModelType {
  MODEL = 'model',
  OVERLAY = 'overlay',
  RESOURCE = 'resource',
  SHARED_RESOURCE = 'shared-resource',
}

export type ActionInputs = { [key: string]: string | UnknownResource };

export type ActionOutputs = { [key: string]: UnknownResource };

export type Constructable<T> = new (...args: any[]) => T;

export type ModelSerializedOutput = {
  anchors: (IAnchor & { className: string })[];
  dependencies: IDependency[];
  models: { [p: string]: { className: string; model: IUnknownModel } };
  modules: { className: string; module: IModule }[];
  overlays: { className: string; overlay: IOverlay }[];
};

export type ResourceSerializedOutput = {
  dependencies: IDependency[];
  resources: { [p: string]: { className: string; resource: IResource } };
  sharedResources: { [p: string]: { className: string; resource: IResource } };
};

export type SupportApplicationType = 'nginx';

export type TransactionOptions = {
  yieldModelTransaction?: boolean;
  yieldNewResources?: boolean;
  yieldResourceDiffs?: boolean;
  yieldResourceTransaction?: boolean;
};

export type IUnknownModel = IModel<unknown, unknown>;

export type UnknownModel = AModel<unknown, unknown>;

export type UnknownOverlay = AOverlay<unknown>;

export type UnknownResource = AResource<unknown>;

export type UnknownSharedResource = ASharedResource<unknown>;
