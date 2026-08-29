import { ECRClient } from '@aws-sdk/client-ecr';
import { Container, ContainerResolutionError, Factory } from '@quadnix/octo';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types';

/**
 * What an account model hands over: either the credentials themselves, or something that resolves
 * them. The SDK takes both under its `credentials` option.
 *
 * @internal
 */
export type AwsClientCredentials = AwsCredentialIdentity | AwsCredentialIdentityProvider;

/**
 * Serves the AWS SDK clients an external resource action needs, one per account and region.
 *
 * A resource terraform manages needs no client - the provider talks to AWS. Only an external
 * resource, whose lifecycle octo drives itself, resolves one of these, and it must authenticate as
 * the account that owns the resource rather than as whoever the ambient credential chain happens to
 * name. An app spanning two accounts depends on that being per-account.
 *
 * The credentials, and any endpoint overrides, are registered by the account module against the
 * account id. A subclass supplies the service name and builds the client.
 *
 * @internal
 */
class AwsClientFactory {
  /**
   * The AWS service name, as it appears in an account module's `endpoints` input, e.g. `ecr`.
   */
  protected static readonly serviceName: string = '';

  private static readonly instances: {
    [key: string]: { awsAccountId: string; awsRegionId: string; value: Promise<any> }[];
  } = {};

  /**
   * @throws {@link ContainerResolutionError} If either the account or the region is missing.
   */
  static async create(awsAccountId: string, awsRegionId: string): Promise<any> {
    if (!awsAccountId || !awsRegionId) {
      throw new ContainerResolutionError(
        `Failed to create instance of ${this.name} due to insufficient arguments!`,
        AwsClientFactory.name,
      );
    }

    if (!this.instances[this.name]) {
      this.instances[this.name] = [];
    }

    // The pending client is cached, not the resolved one, so two callers asking at once share a
    // client rather than racing to build two. Nothing is awaited before the cache is written.
    let instance = this.instances[this.name].find(
      (i) => i.awsAccountId === awsAccountId && i.awsRegionId === awsRegionId,
    );
    if (!instance) {
      instance = { awsAccountId, awsRegionId, value: this.build(awsAccountId, awsRegionId) };
      this.instances[this.name].push(instance);
    }

    return instance.value;
  }

  /**
   * @throws {@link ContainerResolutionError} Always. A subclass builds the client it serves.
   */
  static createInstance(...args: unknown[]): any {
    if (args.length > 3) {
      throw new ContainerResolutionError('Invalid number of args in createInstance()!', AwsClientFactory.name);
    }

    throw new ContainerResolutionError(
      'Method not implemented! Use derived class implementation',
      AwsClientFactory.name,
    );
  }

  /**
   * Forgets every client built so far.
   *
   * The container builds a fresh factory result on every `get()`, so this cache is what makes two
   * resolutions of one account and region the same client. It outlives a `TestContainer`, which
   * only resets the container, so a test that changes what an account's credentials are clears it.
   *
   * @internal
   */
  static reset(): void {
    for (const key of Object.keys(AwsClientFactory.instances)) {
      delete AwsClientFactory.instances[key];
    }
  }

  /**
   * @internal
   */
  private static async build(awsAccountId: string, awsRegionId: string): Promise<any> {
    const container = Container.getInstance();
    const metadata = { awsAccountId, package: '@octo' };

    const credentials = await container.get<AwsClientCredentials>('AwsCredentialIdentityProvider', { metadata });

    // An account pointed at a local stand-in registers one endpoint per service it serves.
    let endpoint: string | undefined;
    if (container.has('AwsServiceEndpoints', { metadata })) {
      const endpoints = await container.get<Record<string, string>>('AwsServiceEndpoints', { metadata });
      endpoint = endpoints[this.serviceName];
    }

    return this.createInstance(awsRegionId, credentials, endpoint);
  }
}

/**
 * @internal
 */
@Factory<ECRClient>(ECRClient, { metadata: { package: '@octo' } })
export class ECRClientFactory extends AwsClientFactory {
  protected static override readonly serviceName: string = 'ecr';

  /**
   * @internal
   */
  static override createInstance(
    awsRegionId: string,
    credentials: AwsClientCredentials,
    endpoint?: string,
  ): ECRClient {
    return new ECRClient({ credentials, endpoint, region: awsRegionId });
  }
}
