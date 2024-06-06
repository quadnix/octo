import { Diff, Environment, type IEnvironment, Model } from '@quadnix/octo';
import { EnvironmentVariablesAnchor } from '../../anchors/environment-variables.anchor.js';

@Model()
export class AwsEnvironment extends Environment {
  constructor(environmentName: string) {
    super(environmentName);

    const evAnchorId = `${this.environmentName.charAt(0).toUpperCase() + this.environmentName.slice(1)}EnvironmentEV`;
    this.anchors.push(new EnvironmentVariablesAnchor(evAnchorId, this));
  }

  override async diff(): Promise<Diff[]> {
    // Skip diff of environmentVariables, since its done in ExecutionOverlay.
    return [];
  }

  static override async unSynth(environment: IEnvironment): Promise<AwsEnvironment> {
    return new AwsEnvironment(environment.environmentName);
  }
}
