import { IDeployment } from '../deployment/deployment.interface';
import { Server } from './server.model';

export interface IServer {
  deployments: IDeployment[];
  serverKey: Server['serverKey'];
}
