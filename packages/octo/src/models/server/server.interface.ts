import { IModelReference } from '../model.interface.js';
import { Server } from './server.model.js';

export interface IServer {
  image: IModelReference;
  serverKey: Server['serverKey'];
}
