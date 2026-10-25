import { ECRClient } from '@aws-sdk/client-ecr';
import { type Container, TestContainer } from '@quadnix/octo';
import { ECRClientFactory } from './aws-client.factory.js';

const CREDENTIALS = { accessKeyId: 'key-of-account', secretAccessKey: 'secret-of-account' };

describe('AwsClientFactory UT', () => {
  let container: Container;

  beforeEach(async () => {
    ECRClientFactory.reset();
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('create()', () => {
    it('should throw error if the account is missing', async () => {
      await expect(ECRClientFactory.create('', 'us-east-1')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to create instance of ECRClientFactory due to insufficient arguments!"`,
      );
    });

    it('should throw error if the region is missing', async () => {
      await expect(ECRClientFactory.create('123456789012', '')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to create instance of ECRClientFactory due to insufficient arguments!"`,
      );
    });

    it('should build the client with the account own credentials, not the ambient ones', async () => {
      container.registerValue('AwsCredentialIdentityProvider', CREDENTIALS, {
        metadata: { awsAccountId: '123456789012', package: '@octo' },
      });

      const client = await ECRClientFactory.create('123456789012', 'us-east-1');

      // Resolved through the client, because that is the only proof they were actually applied -
      // the shape this replaces spread them into the config, where the SDK ignored them.
      await expect(client.config.credentials()).resolves.toMatchObject(CREDENTIALS);
      await expect(client.config.region()).resolves.toBe('us-east-1');
    });

    it('should keep one client per account and region', async () => {
      for (const awsAccountId of ['123456789012', '999999999999']) {
        container.registerValue('AwsCredentialIdentityProvider', CREDENTIALS, {
          metadata: { awsAccountId, package: '@octo' },
        });
      }

      const [first, again, otherRegion, otherAccount] = await Promise.all([
        ECRClientFactory.create('123456789012', 'us-east-1'),
        ECRClientFactory.create('123456789012', 'us-east-1'),
        ECRClientFactory.create('123456789012', 'us-west-2'),
        ECRClientFactory.create('999999999999', 'us-east-1'),
      ]);

      expect(again).toBe(first);
      expect(otherRegion).not.toBe(first);
      expect(otherAccount).not.toBe(first);
    });

    it('should leave a service with no override to the SDK', async () => {
      const metadata = { awsAccountId: '123456789012', package: '@octo' };
      container.registerValue('AwsCredentialIdentityProvider', CREDENTIALS, { metadata });
      container.registerValue('AwsServiceEndpoints', { s3: 'http://localhost:4566' }, { metadata });

      const ecrClient = await ECRClientFactory.create('123456789012', 'us-east-1');

      expect(ecrClient.config.endpoint).toBeUndefined();
    });

    it('should apply the endpoint override of its own service', async () => {
      const metadata = { awsAccountId: '123456789012', package: '@octo' };
      container.registerValue('AwsCredentialIdentityProvider', CREDENTIALS, { metadata });
      container.registerValue('AwsServiceEndpoints', { ecr: 'http://localhost:4566' }, { metadata });

      const ecrClient = await ECRClientFactory.create('123456789012', 'us-east-1');

      expect((await ecrClient.config.endpoint!()).hostname).toBe('localhost');
    });
  });

  describe('createInstance()', () => {
    it('should throw error when the base class is asked to build a client', () => {
      expect(() => Object.getPrototypeOf(ECRClientFactory).createInstance()).toThrowErrorMatchingInlineSnapshot(
        `"Method not implemented! Use derived class implementation"`,
      );
    });
  });
});

describe('ECRClient factory registration UT', () => {
  it('should serve an ECRClient through the container', async () => {
    ECRClientFactory.reset();
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    container.registerValue('AwsCredentialIdentityProvider', CREDENTIALS, {
      metadata: { awsAccountId: '123456789012', package: '@octo' },
    });

    const client = await container.get<ECRClient, typeof ECRClientFactory>(ECRClient, {
      args: ['123456789012', 'us-east-1'],
      metadata: { package: '@octo' },
    });

    expect(client).toBeInstanceOf(ECRClient);

    await TestContainer.reset();
  });
});
