import type {
  ModelSerializedOutput,
  ResourceSerializedOutput,
  TerraformFolderOutput,
  TerraformResourceOutput,
} from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * The `userData` persisted alongside the model graph in `models.json`.
 */
interface ModelStateUserData {
  terraformFolders?: TerraformFolderOutput[];
  version?: number;
}

/**
 * The `userData` persisted alongside the resource graph in `resources-actual.json` /
 * `resources-old.json`.
 */
interface ResourceStateUserData {
  terraformFolders?: TerraformFolderOutput[];
  terraformResources?: TerraformResourceOutput[];
  version?: number;
}

/**
 * Reads and writes Octo's state files through the configured {@link IStateProvider}.
 *
 * Resolve it from the {@link Container} when you need to inspect what the last run recorded.
 * Octo manages its own state files, so writing through this service is rarely the right move.
 *
 * @group Services/State Management
 */
export class StateManagementService {
  private readonly stateProvider: IStateProvider;

  /**
   * @param stateProvider Where state is read from and written to.
   */
  constructor(stateProvider: IStateProvider) {
    this.stateProvider = stateProvider;
  }

  /**
   * Reads the model graph. Returns an empty graph when no state exists yet.
   */
  async getModelState(
    stateFileName: string,
    { freeze = true }: { freeze?: boolean } = {},
  ): Promise<{ data: ModelSerializedOutput; userData: ModelStateUserData }> {
    const defaultValue: { data: ModelSerializedOutput; userData: ModelStateUserData } = {
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
      return JSON.parse(modelState.toString(), (_k, v) => (v && freeze ? Object.freeze(v) : v));
    } catch (error) {
      if (error.message === 'No state found!') {
        return defaultValue;
      } else {
        throw error;
      }
    }
  }

  /**
   * Reads a resource graph. Returns an empty graph when no state exists yet.
   */
  async getResourceState(
    stateFileName: string,
    { freeze = true }: { freeze?: boolean } = {},
  ): Promise<{ data: ResourceSerializedOutput; userData: ResourceStateUserData }> {
    const defaultValue: { data: ResourceSerializedOutput; userData: ResourceStateUserData } = {
      data: {
        dependencies: [],
        resources: {},
      },
      userData: {},
    };

    try {
      const resourceState = await this.getState(stateFileName);
      return JSON.parse(resourceState.toString(), (_k, v) => (v && freeze ? Object.freeze(v) : v));
    } catch (error) {
      if (error.message === 'No state found!') {
        return defaultValue;
      } else {
        throw error;
      }
    }
  }

  /**
   * Reads a state file as-is.
   *
   * @param defaultValue Returned instead of throwing when the file does not exist.
   */
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

  /**
   * @internal
   */
  async saveModelState(
    stateFileName: string,
    data: ModelSerializedOutput,
    userData: ModelStateUserData,
  ): Promise<void> {
    await this.saveState(stateFileName, Buffer.from(JSON.stringify({ data, userData })));
  }

  /**
   * @internal
   */
  async saveResourceState(
    stateFileName: string,
    data: ResourceSerializedOutput,
    userData: ResourceStateUserData,
  ): Promise<void> {
    await this.saveState(stateFileName, Buffer.from(JSON.stringify({ data, userData })));
  }

  /**
   * Writes a state file as-is.
   */
  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    return this.stateProvider.saveState(stateFileName, data);
  }
}

/**
 * @internal
 */
@Factory<StateManagementService>(StateManagementService)
export class StateManagementServiceFactory {
  private static instance: StateManagementService;

  /**
   * @internal
   */
  static async create(stateProvider?: IStateProvider): Promise<StateManagementService> {
    if (!this.instance) {
      if (!stateProvider) {
        throw new TransactionError(
          `Failed to create instance of "${StateManagementService.name}" due to insufficient arguments!`,
        );
      } else {
        this.instance = new StateManagementService(stateProvider);
        return this.instance;
      }
    } else {
      if (!stateProvider) {
        return this.instance;
      } else {
        this.instance = new StateManagementService(stateProvider);
        return this.instance;
      }
    }
  }
}
