import { App, Deployment, Environment, Execution, HOOK_NAMES, IHook, Image, Support } from '@quadnix/octo';

export class AddEnvironmentHook implements IHook {
  readonly HOOK_NAME: HOOK_NAMES = HOOK_NAMES.ADD_ENVIRONMENT;

  readonly args: [app: App, nginxImage: Image, newEnvironment: Environment];

  constructor(args: [app: App, nginxImage: Image, newEnvironment: Environment]) {
    this.args = args;
  }

  handle(app: App, nginxImage: Image, newEnvironment: Environment): void {
    let nginxSupport = app.getChild('support', [{ key: 'serverKey', value: 'nginx' }]) as Support;
    if (!nginxSupport) {
      nginxSupport = new Support('nginx', 'nginx');
      app.addSupport(nginxSupport);
    }

    let nginxDeployment = nginxSupport.getChild('deployment', [
      { key: 'deploymentTag', value: nginxImage.imageTag },
    ]) as Deployment;
    if (!nginxDeployment) {
      nginxDeployment = new Deployment(nginxImage.imageTag, nginxImage);
      nginxSupport.addDeployment(nginxDeployment);
    }

    const nginxExecution = nginxDeployment.getChild('execution', [
      { key: 'executionId', value: [nginxDeployment.deploymentTag, newEnvironment.environmentName].join('_') },
    ]) as Execution;
    if (!nginxExecution) {
      new Execution(nginxDeployment, newEnvironment);
    }
  }
}
