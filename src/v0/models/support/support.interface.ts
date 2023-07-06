import { IDeployment } from '../deployment/deployment.interface';
import { Support } from './support.model';

export interface ISupport {
  applicationType: Support['applicationType'];
  deployments: IDeployment[];
  serverKey: Support['serverKey'];
}
