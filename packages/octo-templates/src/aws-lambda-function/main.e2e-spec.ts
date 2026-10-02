import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { jest } from '@jest/globals';
import { SignatureV4 } from '@smithy/signature-v4';
import axios from 'axios';
import { dump, load } from 'js-yaml';
import { AwsLiveResourcesUtility } from '../utilities/aws/live-resources/aws-live-resources.utility.js';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { OctoCliUtility } from '../utilities/octo/octo-cli.utility.js';
import { config } from './app.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-lambda-function' };

/**
 * A repository name of this run's own, because ECR deletes a repository asynchronously: recreating
 * one seconds after destroying it can be served the repository that is still going away, images and
 * all, and an immutable tag then refuses the push.
 */
const IMAGE_NAME = `octo-lambda-function-${Date.now().toString(36)}`;

const STATE_DIRECTORY_PATH = join(__dirname, '.octo', 'state');

const STATE_FILE_PATH = join(STATE_DIRECTORY_PATH, 'resources-actual.json');

/**
 * How long a call is retried for. A new role can take minutes to become assumable, a new permission
 * on a function URL seconds to take effect, and a new distribution minutes to reach every edge.
 */
const CALL_POLL_ATTEMPTS = 60;

const CALL_POLL_INTERVAL_IN_MS = 10_000;

interface Definition {
  modules: { moduleClass: string; moduleId: string; moduleInputs: Record<string, unknown> }[];
  settings: { stateProvider: { statePath: string } };
}

type FunctionAnswer = { body: string; greeting: string; method: string; path: string };

/**
 * A definition of this template's own, derived from `octo.yaml` by the given edit.
 *
 * Each is written beside the state directory, keeping the same definition directory, which is what
 * anchors the state path every run has to reuse.
 */
async function writeDefinition(name: string, edit: (definition: Definition) => void): Promise<string> {
  const definition = load(await readFile(join(__dirname, 'octo.yaml'), 'utf8')) as Definition;

  edit(definition);
  definition.settings.stateProvider.statePath = 'state';

  const definitionFilePath = join(__dirname, '.octo', `${name}.yaml`);
  await mkdir(join(__dirname, '.octo'), { recursive: true });
  await writeFile(definitionFilePath, dump(definition));

  return definitionFilePath;
}

/**
 * The responses octo committed, keyed by the resource name inside the context.
 */
async function readCommittedResponses(): Promise<{ [resourceName: string]: Record<string, string> }> {
  const state = JSON.parse(await readFile(STATE_FILE_PATH, 'utf8')) as {
    data: { resources: { [context: string]: { resource: { response: Record<string, string> } } } };
  };

  return Object.fromEntries(
    Object.entries(state.data.resources).map(([context, entry]) => [context.split('=')[0], entry.resource.response]),
  );
}

/**
 * The records an external resource's action leaves in octo state, one per resource. A settled state
 * directory holds none.
 */
async function readStateRecordNames(): Promise<string[]> {
  const names = await readdir(STATE_DIRECTORY_PATH);
  return names.filter((name) => name.startsWith('resource-state-')).sort();
}

/**
 * Calls a function URL, signing the request with this machine's AWS credentials, as a caller in the
 * function's own account does.
 */
async function callSigned(functionUrl: string, path: string): Promise<{ data: unknown; status: number }> {
  const url = new URL(path, functionUrl);
  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region: AWS_REGION_ID,
    service: 'lambda',
    sha256: Sha256,
  });
  const signed = await signer.sign({
    headers: { host: url.hostname },
    hostname: url.hostname,
    method: 'GET',
    path: url.pathname,
    protocol: url.protocol,
    query: {},
  });

  const response = await axios.get(url.toString(), { headers: signed.headers, validateStatus: () => true });
  return { data: response.data, status: response.status };
}

/**
 * Makes the call until it answers 200 with a body the check accepts, or gives up.
 *
 * @throws If it never does, with the last answer.
 */
async function waitForAnswer(
  call: () => Promise<{ data: unknown; status: number }>,
  accept: (answer: FunctionAnswer) => boolean,
): Promise<FunctionAnswer> {
  let last: { data: unknown; status: number } = { data: undefined, status: 0 };
  for (let attempt = 0; attempt < CALL_POLL_ATTEMPTS; attempt++) {
    last = await call();
    if (last.status === 200 && accept(last.data as FunctionAnswer)) {
      return last.data as FunctionAnswer;
    }

    await new Promise((resolve) => setTimeout(resolve, CALL_POLL_INTERVAL_IN_MS));
  }

  throw new Error(`Never answered as expected! Last answer: ${last.status} ${JSON.stringify(last.data)}`);
}

jest.setTimeout(3_600_000);

describe('Main E2E', () => {
  const environment = { AWS_ACCOUNT_ID: config.AWS_ACCOUNT_ID, AWS_IMAGE_NAME: IMAGE_NAME, GREETING: 'hello' };

  let distributionDomainName: string;
  let functionUrl: string;

  it('should run the published image on Lambda, answering only signed requests on its URL', async () => {
    await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', environment);

    const responses = await readCommittedResponses();
    const functionResponse = responses['@octo/lambda-function'];
    functionUrl = functionResponse.FunctionUrl;
    distributionDomainName = responses['@octo/cloudfront-distribution'].DomainName;

    expect(functionResponse.FunctionName).toBe('octo-lambda-function-template');
    expect(functionResponse.Arn).toBe(
      `arn:aws:lambda:${AWS_REGION_ID}:${config.AWS_ACCOUNT_ID}:function:octo-lambda-function-template`,
    );
    expect(functionUrl).toMatch(/^https:\/\/[a-z0-9]+\.lambda-url\.us-east-1\.on\.aws\/$/);
    expect(`https://${functionResponse.FunctionUrlDomainName}/`).toBe(functionUrl);
    expect(await readStateRecordNames()).toEqual([]);

    const answer = await waitForAnswer(
      () => callSigned(functionUrl, '/greet'),
      () => true,
    );
    expect(answer).toEqual({ body: '', greeting: 'hello', method: 'GET', path: '/greet' });

    // A request nobody signed is refused.
    const unsigned = await axios.get(new URL('/greet', functionUrl).toString(), { validateStatus: () => true });
    expect(unsigned.status).toBe(403);
  });

  it('should serve the function through CloudFront, which signs what it forwards', async () => {
    const answer = await waitForAnswer(
      async () => {
        const response = await axios.get(`https://${distributionDomainName}/greet?from=edge`, {
          validateStatus: () => true,
        });
        return { data: response.data, status: response.status };
      },
      () => true,
    );
    expect(answer).toEqual({ body: '', greeting: 'hello', method: 'GET', path: '/greet?from=edge' });

    // A body reaches the function only with its SHA-256 in the content hash header, because
    // CloudFront signs the request it forwards, body and all.
    const body = JSON.stringify({ name: 'octo' });
    const response = await axios.post(`https://${distributionDomainName}/echo`, body, {
      headers: {
        'content-type': 'application/json',
        // eslint-disable-next-line spellcheck/spell-checker
        'x-amz-content-sha256': createHash('sha256').update(body).digest('hex'),
      },
      validateStatus: () => true,
    });
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ body, greeting: 'hello', method: 'POST', path: '/echo' });
  });

  it('should answer with the new value once the environment changes', async () => {
    await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', { ...environment, GREETING: 'hello again' });

    // The function is updated in place: same name, same URL.
    const responses = await readCommittedResponses();
    expect(responses['@octo/lambda-function'].FunctionUrl).toBe(functionUrl);

    const answer = await waitForAnswer(
      () => callSigned(functionUrl, '/greet'),
      (a) => a.greeting === 'hello again',
    );
    expect(answer.greeting).toBe('hello again');
  });

  it('should have no resources left after teardown', async () => {
    const definitionFilePath = await writeDefinition('teardown', (definition) => {
      definition.modules = definition.modules.filter(
        (m) => m.moduleId === 'app-module' || m.moduleId === 'account-module',
      );
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    const taggedArns = await new AwsTagsUtility(AWS_REGION_ID).getResourceArnsByTags(E2E_TAGS);
    const liveArns = await new AwsLiveResourcesUtility(AWS_REGION_ID).filterLiveArns(taggedArns);
    expect(liveArns).toEqual([]);

    const unsigned = await axios.get(functionUrl, { validateStatus: () => true }).catch(() => ({ status: 0 }));
    expect(unsigned.status).not.toBe(200);
  });
});
