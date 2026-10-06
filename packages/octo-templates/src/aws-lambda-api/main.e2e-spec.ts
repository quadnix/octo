import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { jest } from '@jest/globals';
import { SignatureV4 } from '@smithy/signature-v4';
import axios from 'axios';
import { AwsLiveResourcesUtility } from '../utilities/aws/live-resources/aws-live-resources.utility.js';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { OctoCliUtility } from '../utilities/octo/octo-cli.utility.js';
import { config } from './app.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-lambda-api' };

/**
 * A repository name of this run's own, because ECR deletes a repository asynchronously: recreating
 * one seconds after destroying it can be served the repository that is still going away, images and
 * all, and an immutable tag then refuses the push.
 */
const IMAGE_NAME = `octo-lambda-api-${Date.now().toString(36)}`;

/**
 * How long a call is retried for. A new role can take minutes to become assumable, a new permission
 * on a function URL seconds to take effect, and a new distribution minutes to reach every edge.
 */
const CALL_POLL_ATTEMPTS = 60;

const CALL_POLL_INTERVAL_IN_MS = 10_000;

const PRIVATE_FUNCTION_ARN = `arn:aws:lambda:${AWS_REGION_ID}:${config.AWS_ACCOUNT_ID}:function:octo-lambda-api-private`;

/**
 * How many megabytes the streamer answers with: past the 6 MB a buffered response is capped at.
 */
const STREAM_MEGABYTES = 8;

type GreeterAnswer = { body: string; greeting: string; method: string; path: string };

type PrivateCallAnswer = { body: string; status: number; step: 'invoke' | 'lookup' };

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
async function waitForAnswer<T>(
  call: () => Promise<{ data: unknown; status: number }>,
  accept: (answer: T) => boolean,
): Promise<T> {
  let last: { data: unknown; status: number } = { data: undefined, status: 0 };
  for (let attempt = 0; attempt < CALL_POLL_ATTEMPTS; attempt++) {
    last = await call();
    if (last.status === 200 && accept(last.data as T)) {
      return last.data as T;
    }

    await new Promise((resolve) => setTimeout(resolve, CALL_POLL_INTERVAL_IN_MS));
  }

  throw new Error(`Never answered as expected! Last answer: ${last.status} ${JSON.stringify(last.data)}`);
}

jest.setTimeout(3_600_000);

describe('Main E2E', () => {
  const environment = {
    AWS_ACCOUNT_ID: config.AWS_ACCOUNT_ID,
    AWS_IMAGE_NAME: IMAGE_NAME,
    GREETING: 'hello',
    PRIVATE_FUNCTION_ARN,
  };

  let distributionDomainName: string;
  let greeterUrl: string;
  let privateUrl: string;

  it('should run the published image as three functions, each answering only signed requests on its URL', async () => {
    await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', environment);

    const functionResponses = await OctoCliUtility.readCommittedResponsesOf(__dirname, '@octo/lambda-function');
    expect(functionResponses.map((r) => r.FunctionName).sort()).toEqual([
      'octo-lambda-api-greeter',
      'octo-lambda-api-private',
      'octo-lambda-api-streamer',
    ]);
    for (const functionResponse of functionResponses) {
      expect(functionResponse.Arn).toBe(
        `arn:aws:lambda:${AWS_REGION_ID}:${config.AWS_ACCOUNT_ID}:function:${functionResponse.FunctionName}`,
      );
      expect(functionResponse.FunctionUrl).toMatch(/^https:\/\/[a-z0-9]+\.lambda-url\.us-east-1\.on\.aws\/$/);
      expect(`https://${functionResponse.FunctionUrlDomainName}/`).toBe(functionResponse.FunctionUrl);
    }
    greeterUrl = functionResponses.find((r) => r.FunctionName === 'octo-lambda-api-greeter')!.FunctionUrl;
    privateUrl = functionResponses.find((r) => r.FunctionName === 'octo-lambda-api-private')!.FunctionUrl;
    distributionDomainName = (await OctoCliUtility.readCommittedResponses(__dirname))['@octo/cloudfront-distribution']
      .DomainName;
    expect(await OctoCliUtility.readStateRecordNames(__dirname)).toEqual([]);

    const answer = await waitForAnswer<GreeterAnswer>(
      () => callSigned(greeterUrl, '/greet'),
      () => true,
    );
    expect(answer).toEqual({ body: '', greeting: 'hello', method: 'GET', path: '/greet' });

    // A request nobody signed is refused, by every function.
    for (const functionUrl of [greeterUrl, privateUrl]) {
      const unsigned = await axios.get(functionUrl, { validateStatus: () => true });
      expect(unsigned.status).toBe(403);
    }
  });

  it('should serve the greeter through CloudFront, which signs what it forwards', async () => {
    const answer = await waitForAnswer<GreeterAnswer>(
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
        'x-amz-content-sha256': createHash('sha256').update(body).digest('hex'),
      },
      validateStatus: () => true,
    });
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ body, greeting: 'hello', method: 'POST', path: '/echo' });
  });

  it("should reach the private function from the greeter, by the IAM statements of the greeter's server", async () => {
    // The private function's URL admits no one by its own policy, no account and no distribution, so
    // the greeter gets through on its role's IAM statements alone. AWS admits a caller of the
    // function's own account on its identity policy, so a call signed by this machine proves nothing
    // either way; the next case removes the statements and is refused.
    const answer = await waitForAnswer<PrivateCallAnswer>(
      async () => {
        const response = await axios.get(`https://${distributionDomainName}/private`, { validateStatus: () => true });
        return { data: response.data, status: response.status };
      },
      (a) => a.status === 200,
    );
    expect(answer).toEqual({ body: JSON.stringify({ from: 'private' }), status: 200, step: 'invoke' });
  });

  it('should stream a response past the 6 MB a buffered response is capped at, through CloudFront', async () => {
    const answer = await waitForAnswer<number>(
      async () => {
        const response = await axios.get(`https://${distributionDomainName}/stream/megabytes`, {
          responseType: 'arraybuffer',
          validateStatus: () => true,
        });
        return { data: (response.data as ArrayBuffer).byteLength, status: response.status };
      },
      () => true,
    );
    expect(answer).toBe(STREAM_MEGABYTES * 1024 * 1024);
  });

  it('should answer with the new value once the environment changes', async () => {
    await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', { ...environment, GREETING: 'hello again' });

    // The function is updated in place: same name, same URL.
    const functionResponses = await OctoCliUtility.readCommittedResponsesOf(__dirname, '@octo/lambda-function');
    expect(functionResponses.find((r) => r.FunctionName === 'octo-lambda-api-greeter')!.FunctionUrl).toBe(greeterUrl);

    const answer = await waitForAnswer<GreeterAnswer>(
      () => callSigned(greeterUrl, '/greet'),
      (a) => a.greeting === 'hello again',
    );
    expect(answer.greeting).toBe('hello again');
  });

  it('should refuse the greeter the private function once its server stops granting the invoke', async () => {
    const definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'without-invoke', (definition) => {
      const greeterServer = definition.modules.find((m) => m.moduleId === 'greeter-server-module')!;
      const statements = greeterServer.moduleInputs.iamStatements as { actions: string[] }[];
      greeterServer.moduleInputs.iamStatements = statements.filter((s) => !s.actions.includes('lambda:InvokeFunction'));
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    // The lookup is still allowed, so the call fails on the invoke, refused by the private function's URL.
    const answer = await waitForAnswer<PrivateCallAnswer>(
      async () => {
        const response = await axios.get(`https://${distributionDomainName}/private`, { validateStatus: () => true });
        return { data: response.data, status: response.status };
      },
      (a) => a.status === 403,
    );
    expect(answer.step).toBe('invoke');
  });

  it('should have no resources left after teardown', async () => {
    const definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'teardown', (definition) => {
      definition.modules = definition.modules.filter(
        (m) => m.moduleId === 'app-module' || m.moduleId === 'account-module',
      );
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    const taggedArns = await new AwsTagsUtility(AWS_REGION_ID).getResourceArnsByTags(E2E_TAGS);
    const liveArns = await new AwsLiveResourcesUtility(AWS_REGION_ID).filterLiveArns(taggedArns);
    expect(liveArns).toEqual([]);

    for (const functionUrl of [greeterUrl, privateUrl]) {
      const unsigned = await axios.get(functionUrl, { validateStatus: () => true }).catch(() => ({ status: 0 }));
      expect(unsigned.status).not.toBe(200);
    }
  });
});
