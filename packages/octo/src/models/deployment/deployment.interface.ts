import { IModelReference } from '../model.interface.js';
import { Deployment } from './deployment.model.js';

export interface IDeployment {
  deploymentTag: Deployment['deploymentTag'];
  image: IModelReference;
}
