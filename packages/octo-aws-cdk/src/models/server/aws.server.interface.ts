import { IServer } from '@quadnix/octo';
import { IModelReference } from '@quadnix/octo/dist/models/model.interface';

export interface IAwsServer extends IServer {
  region: IModelReference;
}
