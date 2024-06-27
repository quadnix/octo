import { Diff, Environment, type IEnvironment, Model } from '@quadnix/octo';
import { EnvironmentVariablesAnchor } from '../../anchors/environment-variables.anchor.js';

@Model()
export class AwsEnvironment extends Environment {
  constructor(environmentName: string) {
    super(environmentName);

    this.addAnchor(new EnvironmentVariablesAnchor('EnvironmentVariablesAnchor', {}, this));
  }

  override async diffProperties(): Promise<Diff[]> {
    // Skip diff of environmentVariables, since its done in ExecutionOverlay.
    return [];
  }

  static override async unSynth(environment: IEnvironment): Promise<AwsEnvironment> {
    return new AwsEnvironment(environment.environmentName);
  }
}
