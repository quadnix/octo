import { SerializationService } from '../serialization/serialization.service';
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

  async getApplicationState(): Promise<ReturnType<SerializationService['serialize']>> {
    return this.stateProvider.getApplicationState();
  }

  async getBufferState(stateFileName: string): Promise<Buffer> {
    return this.stateProvider.getBufferState(stateFileName);
  }

  async saveApplicationState(serializedState: ReturnType<SerializationService['serialize']>): Promise<void> {
    return this.stateProvider.saveApplicationState(serializedState);
  }

  async saveBufferState(stateFileName: string, data: Buffer): Promise<void> {
    return this.stateProvider.saveBufferState(stateFileName, data);
  }
}
