import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import axios from 'axios';
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import { OctoCliUtility } from '../utilities/octo/octo-cli.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOCALSTACK_ACCOUNT_ID = '000000000000';
const LOCALSTACK_ENDPOINT = 'http://localhost:4566';

const BUCKET_NAME = 'octo-aws-s3-website-integration';

jest.setTimeout(600_000);

describe('Main IT', () => {
  const environment = { AWS_ACCOUNT_ID: LOCALSTACK_ACCOUNT_ID, AWS_S3_WEBSITE_BUCKET_NAME: BUCKET_NAME };

  let composeEnvironment: StartedDockerComposeEnvironment;
  let definitionFilePath: string;

  beforeAll(async () => {
    composeEnvironment = await new DockerComposeEnvironment(__dirname, 'docker-compose.yml')
      .withWaitStrategy('localstack-aws-s3-website', Wait.forLogMessage('Ready.'))
      .up();

    // The template, with its account and provider pointed at LocalStack, and a state of its own.
    definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'localstack', (definition) => {
      definition.settings.stateProvider.statePath = 'localstack-state';
      definition.imports.push({
        className: 'AwsLocalstackAccountModule',
        importPath: '@quadnix/octo-aws-cdk/modules/account/aws-localstack-account',
      });
      const account = definition.modules.find((module) => module.moduleId === 'account-module')!;
      account.moduleClass = 'AwsLocalstackAccountModule';
      account.moduleInputs = {
        app: account.moduleInputs.app,
        endpoints: { s3: LOCALSTACK_ENDPOINT, sts: LOCALSTACK_ENDPOINT },
      };
      definition.terraform.providers[0].spec = {
        access_key: 'test',
        endpoints: { s3: LOCALSTACK_ENDPOINT, sts: LOCALSTACK_ENDPOINT },
        s3_use_path_style: true,
        secret_key: 'test',
        skip_credentials_validation: true,
        skip_metadata_api_check: true,
        skip_requesting_account_id: true,
      };
    });
  });

  afterAll(async () => {
    await composeEnvironment?.down({ removeVolumes: true, timeout: 10_000 });
  });

  it('should create the website', async () => {
    const report = await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);
    expect(report.failures).toEqual([]);

    expect((await axios.get(`${LOCALSTACK_ENDPOINT}/${BUCKET_NAME}/index.html`)).data).toContain(
      'This is my first website!',
    );
    expect((await axios.get(`${LOCALSTACK_ENDPOINT}/${BUCKET_NAME}/error.html`)).data).toContain('This is an error!');
  });

  it('should plan nothing when the applied intent is planned again', async () => {
    const report = await OctoCliUtility.validate(__dirname, definitionFilePath, environment);

    expect(report.changes).toEqual([]);
    expect(report.drift).toEqual([]);
  });

  it('should delete the website', async () => {
    const teardownFilePath = await OctoCliUtility.writeDefinition(
      __dirname,
      'localstack-teardown',
      (definition) => {
        definition.modules = definition.modules.filter((module) =>
          ['account-module', 'app-module'].includes(module.moduleId),
        );
      },
      '.octo/localstack.yaml',
    );
    const report = await OctoCliUtility.lifecycle(__dirname, teardownFilePath, environment);

    expect(report.changes).toContainEqual({
      action: 'delete',
      address: expect.stringMatching(/^aws_s3_bucket\./),
      fields: [],
    });
    await expect(axios.get(`${LOCALSTACK_ENDPOINT}/${BUCKET_NAME}/index.html`)).rejects.toThrow();
  });
});
