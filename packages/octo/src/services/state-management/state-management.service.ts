import { IStateProvider } from './state-provider.interface';

export class StateManagementService {
  private readonly stateProvider: IStateProvider;

  private static instance: StateManagementService;

  private constructor(stateProvider: IStateProvider) {
    this.stateProvider = stateProvider;
  }

  static getInstance(stateProvider?: IStateProvider, forceNew?: boolean): StateManagementService {
    if (!StateManagementService.instance || forceNew) {
      if (!stateProvider) {
        throw new Error('No state provider!');
      }
      StateManagementService.instance = new StateManagementService(stateProvider);
    }

    return StateManagementService.instance;
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
