import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import process from 'node:process';
// The image installs aws4; this package does not.
// eslint-disable-next-line import/no-unresolved
import aws4 from 'aws4';

/**
 * Makes a GET signed as this function's role, and resolves with the status and the body.
 */
function getSigned(host, path) {
  const options = aws4.sign({ host, method: 'GET', path, region: process.env.AWS_REGION, service: 'lambda' });
  return new Promise((resolve, reject) => {
    httpsRequest(options, (response) => {
      let body = '';
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve({ body, status: response.statusCode }));
    })
      .on('error', reject)
      .end();
  });
}

/**
 * Looks up the private function's URL by name, then calls it. Both are allowed only by the server's IAM
 * statements.
 */
async function callPrivateFunction() {
  const lookup = await getSigned(
    `lambda.${process.env.AWS_REGION}.amazonaws.com`,
    `/2021-10-31/functions/${process.env.PRIVATE_FUNCTION_NAME}/url`,
  );
  if (lookup.status !== 200) {
    return { body: lookup.body, status: lookup.status, step: 'lookup' };
  }

  const { FunctionUrl } = JSON.parse(lookup.body);
  const invoke = await getSigned(new URL(FunctionUrl).hostname, '/');
  return { body: invoke.body, status: invoke.status, step: 'invoke' };
}

// Answers `/private` with what the private function answered, and every other request with what it was asked
// and the greeting its environment holds.
createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', async () => {
    const answer =
      request.url === '/private'
        ? await callPrivateFunction()
        : { body, greeting: process.env.GREETING, method: request.method, path: request.url };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(answer));
  });
}).listen(Number(process.env.PORT));
