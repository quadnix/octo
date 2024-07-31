import type { IModelReference } from '../model.interface.js';

/**
 * {@link Execution} model interface.
 *
 * @group Model Interfaces
 */
export interface IExecution {
  deployment: IModelReference;
  environment: IModelReference;
  environmentVariables: { [key: string]: string };
  subnet: IModelReference;
}
