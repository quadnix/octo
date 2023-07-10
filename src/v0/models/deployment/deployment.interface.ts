import { IExecution } from '../execution/execution.interface';
import { IImage } from '../image/image.interface';
import { Deployment } from './deployment.model';

export interface IDeployment {
  deploymentTag: Deployment['deploymentTag'];
  executions: IExecution[];
  imageId: IImage['imageId'];
}
