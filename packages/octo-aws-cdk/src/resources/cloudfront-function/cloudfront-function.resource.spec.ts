import { CloudFrontFunction } from './cloudfront-function.resource.js';

function createCloudFrontFunction(overrides: Partial<CloudFrontFunction['properties']> = {}): CloudFrontFunction {
  return new CloudFrontFunction('cloudfront-function-rewrite', {
    awsAccountId: '123456789012',
    code: 'function handler(event) {\n  return event.request;\n}\n',
    name: 'rewrite',
    ...overrides,
  });
}

describe('CloudFrontFunction UT', () => {
  describe('diffProperties()', () => {
    it('should report nothing when nothing moved', async () => {
      expect(await createCloudFrontFunction().diffProperties(createCloudFrontFunction())).toEqual([]);
    });

    it('should replace when the account moves', async () => {
      const diffs = await createCloudFrontFunction({ awsAccountId: '999999999999' }).diffProperties(
        createCloudFrontFunction(),
      );

      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['replace resourceId']);
    });

    it('should update in place when the code changes', async () => {
      const diffs = await createCloudFrontFunction({
        code: 'function handler(event) { return event.response; }',
      }).diffProperties(createCloudFrontFunction());

      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['update properties']);
    });
  });

  describe('toHCL()', () => {
    it('should publish the code as written, escaping what terraform would interpolate', async () => {
      const emitted: { name: string; spec: any; type: string }[] = [];
      const terraform = {
        addOctoTerraformResource: (): unknown => ({
          addTerraformResource: (type: string, name: string, spec: unknown): { address: string } => {
            emitted.push({ name, spec, type });
            return { address: `${type}.${name}` };
          },
          output: (): void => {},
        }),
        raw: (value: string): string => value,
      };

      await createCloudFrontFunction({
        code: 'function handler(event) {\n  return `${event.request.uri}%{x}`;\n}\n',
      }).toHCL(terraform as any);

      expect(emitted).toMatchInlineSnapshot(`
       [
         {
           "name": "cloudfront-function-rewrite",
           "spec": {
             "code": "<<-OCTO_CLOUDFRONT_FUNCTION_CODE
       function handler(event) {
         return \`$\${event.request.uri}%%{x}\`;
       }
       OCTO_CLOUDFRONT_FUNCTION_CODE",
             "name": "rewrite",
             "publish": true,
             "runtime": "cloudfront-js-2.0",
           },
           "type": "aws_cloudfront_function",
         },
       ]
      `);
    });
  });
});
