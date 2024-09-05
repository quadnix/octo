import { ModelSerializedOutput, ResourceSerializedOutput } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

export class StateManagementService {
  private readonly stateProvider: IStateProvider;

  constructor(stateProvider: IStateProvider) {
    this.stateProvider = stateProvider;
  }

  async getModelState(
    stateFileName: string,
    { freeze = true }: { freeze?: boolean } = {},
  ): Promise<{ data: ModelSerializedOutput; userData: object }> {
    const defaultValue: { data: ModelSerializedOutput; userData: object } = {
      data: {
        anchors: [],
        dependencies: [],
        models: {},
        overlays: [],
      },
      userData: {},
    };

    try {
      const modelState = await this.getState(stateFileName);
      return JSON.parse(modelState.toString(), (k, v) => (v && freeze ? Object.freeze(v) : v));
    } catch (error) {
      if (error.message === 'No state found!') {
        return defaultValue;
      } else {
        throw error;
      }
    }
  }

  async getResourceState(
    stateFileName: string,
    { freeze = true }: { freeze?: boolean } = {},
  ): Promise<{ data: ResourceSerializedOutput; userData: object }> {
    const defaultValue: { data: ResourceSerializedOutput; userData: object } = {
      data: {
        dependencies: [],
        resources: {},
        sharedResources: {},
      },
      userData: {},
    };

    try {
      const resourceState = await this.getState(stateFileName);
      return JSON.parse(resourceState.toString(), (k, v) => (v && freeze ? Object.freeze(v) : v));
    } catch (error) {
      if (error.message === 'No state found!') {
        return defaultValue;
      } else {
        throw error;
      }
    }
  }

  async getState(stateFileName: string, defaultValue?: any): Promise<Buffer> {
    try {
      return await this.stateProvider.getState(stateFileName);
    } catch (error) {
      if (error.message === 'No state found!' && defaultValue) {
        return defaultValue;
      } else {
        throw error;
      }
    }
  }

  async saveModelState(stateFileName: string, data: ModelSerializedOutput, userData: object): Promise<void> {
    await this.saveState(stateFileName, Buffer.from(JSON.stringify({ data, userData })));
  }

  async saveResourceState(stateFileName: string, data: ResourceSerializedOutput, userData: object): Promise<void> {
    await this.saveState(stateFileName, Buffer.from(JSON.stringify({ data, userData })));
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    return this.stateProvider.saveState(stateFileName, data);
  }
}

@Factory<StateManagementService>(StateManagementService)
export class StateManagementServiceFactory {
  private static instance: StateManagementService;

  static async create(forceNew = false, stateProvider: IStateProvider): Promise<StateManagementService> {
    if (!this.instance || forceNew) {
      if (!stateProvider) {
        throw new TransactionError(
          `Failed to create instance of "${StateManagementService.name}" due to insufficient arguments!`,
        );
      }
      this.instance = new StateManagementService(stateProvider);
    }
    return this.instance;
  }
}
