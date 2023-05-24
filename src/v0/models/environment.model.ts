export class Environment {
  readonly environmentName: string;

  readonly environmentVariables: Map<string, string> = new Map();

  constructor(environmentName: string) {
    this.environmentName = environmentName;
  }
}
