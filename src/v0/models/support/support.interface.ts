import { IDeployment } from '../deployment/deployment.interface';
import { Support } from './support.model';

export interface ISupport {
  deployments: IDeployment[];
  serverKey: Support['serverKey'];
}
