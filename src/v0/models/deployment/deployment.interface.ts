import { IExecution } from '../execution/execution.interface';
import { Deployment } from './deployment.model';

export interface IDeployment {
  deploymentTag: Deployment['deploymentTag'];
  executions: IExecution[];
}
