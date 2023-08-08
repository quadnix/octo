import { SerializedOutput } from '../serialization/serialization.service';

export interface IStateProvider {
  getApplicationState(): Promise<SerializedOutput>;

  getBufferState(stateFileName: string): Promise<Buffer>;

  saveApplicationState(serializedState: SerializedOutput): Promise<void>;

  saveBufferState(stateFileName: string, data: Buffer): Promise<void>;
}
