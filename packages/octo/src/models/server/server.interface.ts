import { IModelReference } from '../model.interface';
import { Server } from './server.model';

export interface IServer {
  image: IModelReference;
  serverKey: Server['serverKey'];
}
