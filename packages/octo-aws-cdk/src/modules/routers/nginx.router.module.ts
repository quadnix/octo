import { AModule, App, Deployment, Environment, Execution, Image, Support } from '@quadnix/octo';

export class NginxRouterModule extends AModule {
  private nginxServerKey = 'nginx';

  apply(app: App, nginxImage: Image, environment: Environment): void {
    const nginxDeploymentTag = `${this.nginxServerKey}@${nginxImage.imageTag}`;

    let nginxSupport = app.getChild('support', [{ key: 'serverKey', value: 'nginx' }]) as Support;
    if (!nginxSupport) {
      nginxSupport = new Support(this.nginxServerKey, 'nginx');
      app.addSupport(nginxSupport);
      this.addMember(nginxSupport);
    }

    let nginxDeployment = nginxSupport.getChild('deployment', [
      { key: 'deploymentTag', value: nginxDeploymentTag },
    ]) as Deployment;
    if (!nginxDeployment) {
      nginxDeployment = new Deployment(nginxDeploymentTag);
      nginxSupport.addDeployment(nginxDeployment);
      this.addMember(nginxDeployment);
    }

    let nginxExecution = nginxDeployment.getChild('execution', [
      { key: 'executionId', value: [nginxDeployment.deploymentTag, environment.environmentName].join('_') },
    ]) as Execution;
    if (!nginxExecution) {
      nginxExecution = new Execution(nginxDeployment, environment, nginxImage);
      this.addMember(nginxExecution);
    }
  }

  remove(app: App, nginxImage: Image, environment: Environment): void {
    const nginxDeploymentTag = `${this.nginxServerKey}@${nginxImage.imageTag}`;

    const nginxSupport = app.getChild('support', [{ key: 'serverKey', value: 'nginx' }]) as Support;
    const nginxDeployment = nginxSupport?.getChild('deployment', [
      { key: 'deploymentTag', value: nginxDeploymentTag },
    ]) as Deployment;
    const nginxExecution = nginxDeployment?.getChild('execution', [
      { key: 'executionId', value: [nginxDeployment.deploymentTag, environment.environmentName].join('_') },
    ]) as Execution;

    if (nginxExecution) {
      nginxExecution.remove(true); // ignoring execution and image relationship.
      this.removeMember(nginxExecution);
    }

    const nginxDeploymentChildren = nginxDeployment?.getChildren();
    if (nginxDeployment && Object.keys(nginxDeploymentChildren).length === 0) {
      nginxDeployment.remove();
      this.removeMember(nginxDeployment);
    }

    const nginxSupportChildren = nginxSupport?.getChildren();
    if (nginxSupport && Object.keys(nginxSupportChildren).length === 0) {
      nginxSupport.remove();
      this.removeMember(nginxSupport);
    }
  }
}
