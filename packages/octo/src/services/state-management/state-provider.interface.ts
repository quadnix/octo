import { SerializationService } from '../serialization/serialization.service';

export interface IStateProvider {
  getApplicationState(): Promise<ReturnType<SerializationService['serialize']>>;

  getBufferState(stateFileName: string): Promise<Buffer>;

  saveApplicationState(serializedState: ReturnType<SerializationService['serialize']>): Promise<void>;

  saveBufferState(stateFileName: string, data: Buffer): Promise<void>;
}
