import { IModelReference } from '../model.interface';
import { Deployment } from './deployment.model';

export interface IDeployment {
  deploymentTag: Deployment['deploymentTag'];
  image: IModelReference;
}
