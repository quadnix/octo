import { IModelReference, IServer } from '@quadnix/octo';

export interface IAwsServer extends IServer {
  region: IModelReference;
}
