import { IDependency } from './functions/dependency/dependency.model.js';
import { IModule } from './functions/module/module.interface.js';
import { IAnchor } from './functions/overlay/anchor.interface.js';
import { AModel } from './models/model.abstract.js';
import { IModel } from './models/model.interface.js';
import { AResource } from './resources/resource.abstract.js';
import { IResource } from './resources/resource.interface.js';
import { ASharedResource } from './resources/shared-resource.abstract.js';

export enum ModelType {
  MODEL = 'model',
  RESOURCE = 'resource',
  SHARED_RESOURCE = 'shared-resource',
}

export type ActionInputs = { [key: string]: string | UnknownResource };

export type ActionOutputs = { [key: string]: UnknownResource };

export type ModelSerializedOutput = {
  anchors: (IAnchor & { className: string })[];
  dependencies: IDependency[];
  models: { [p: string]: { className: string; model: IUnknownModel } };
  modules: { className: string; module: IModule }[];
};

export type ResourceMarkers = { delete: boolean; replace: boolean; update: { key: string; value: any } | null };

export type ResourceSerializedOutput = {
  dependencies: IDependency[];
  resources: { [p: string]: { className: string; isSharedResource: boolean; resource: IResource } };
  sharedResources: { [p: string]: { className: string; resourceClassName: string; sharedResource: IResource } };
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

export type UnknownResource = AResource<unknown>;

export type UnknownSharedResource = ASharedResource<unknown>;
