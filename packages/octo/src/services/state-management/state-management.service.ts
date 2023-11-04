import { Container } from '../../decorators/container.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { IStateProvider } from './state-provider.interface.js';

export class StateManagementService {
  private readonly stateProvider: IStateProvider;

  constructor(stateProvider: IStateProvider) {
    this.stateProvider = stateProvider;
  }

  async getState(stateFileName: string, defaultValue?: any): Promise<Buffer> {
    try {
      return await this.stateProvider.getState(stateFileName);
    } catch (error) {
      if (error.code === 'ENOENT' && defaultValue) {
        return defaultValue;
      } else {
        throw error;
      }
    }
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    return this.stateProvider.saveState(stateFileName, data);
  }
}

@Factory<StateManagementService>(StateManagementService)
export class StateManagementServiceFactory {
  private static instance: StateManagementService;

  static async create(): Promise<StateManagementService> {
    if (!this.instance) {
      const stateProvider = await Container.get<IStateProvider>('IStateProvider');
      this.instance = new StateManagementService(stateProvider);
    }
    return this.instance;
  }
}
