import { IAMClient } from '@aws-sdk/client-iam';
import { AModule, type Account, type App, Container, ContainerRegistrationError, Module, Schema } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsIamRoleAnchor } from './anchors/aws-iam-role.anchor.js';
import { AwsSecurityGroupAnchor, type ISecurityGroupAnchorRule } from './anchors/aws-security-group.anchor.js';
import { AwsServer } from './models/server/index.js';

export class AwsServerModuleSchema {
  account = Schema<Account>();

  securityGroupRules? = Schema<ISecurityGroupAnchorRule[]>([]);

  serverKey = Schema<string>();
}

@Module<AwsServerModule>('@octo', AwsServerModuleSchema)
export class AwsServerModule extends AModule<AwsServerModuleSchema, AwsServer> {
  async onInit(inputs: AwsServerModuleSchema): Promise<AwsServer> {
    const account = inputs.account;
    const app = account.getParents()['app'][0].to as App;

    // Create a new server.
    const server = new AwsServer(inputs.serverKey);
    app.addServer(server);

    const awsIamRoleAnchor = new AwsIamRoleAnchor(
      'AwsIamRoleAnchor',
      { iamRoleName: `ServerRole-${inputs.serverKey}` },
      server,
    );
    server.addAnchor(awsIamRoleAnchor);
    const awsSecurityGroupAnchor = new AwsSecurityGroupAnchor(
      'AwsSecurityGroupAnchor',
      { rules: [], securityGroupName: `SecurityGroup-${inputs.serverKey}` },
      server,
    );
    server.addAnchor(awsSecurityGroupAnchor);

    // Add security-group rules.
    for (const rule of inputs.securityGroupRules || []) {
      const existingRule = awsSecurityGroupAnchor.properties.rules.find(
        (r) =>
          r.CidrBlock === rule.CidrBlock &&
          r.Egress === rule.Egress &&
          r.FromPort === rule.FromPort &&
          r.IpProtocol === rule.IpProtocol &&
          r.ToPort === rule.ToPort,
      );
      if (!existingRule) {
        awsSecurityGroupAnchor.properties.rules.push(rule);
      }
    }

    // Create and register a new IAMClient.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const iamClient = new IAMClient({ ...credentials });
    const container = Container.getInstance();
    try {
      container.registerValue(IAMClient, iamClient, {
        metadata: { package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return server;
  }
}
