export class Environment {
  environmentName: string;

  environmentVariables: Map<string, string> = new Map();

  constructor(environmentName: string) {
    this.environmentName = environmentName;
  }

  addEnvironmentVariables(environmentVariables: Map<string, string>): void {
    this.environmentVariables = environmentVariables;
  }

  addToEnvironmentVariables(key: string, value: string): void {
    this.environmentVariables.set(key, value);
  }

  removeFromEnvironmentVariables(key: string): boolean {
    return this.environmentVariables.delete(key);
  }
}
