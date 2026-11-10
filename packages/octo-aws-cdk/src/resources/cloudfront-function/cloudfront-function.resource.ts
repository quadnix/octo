import { ATerraformResource, Diff, DiffAction, DiffUtility, Resource, type TerraformModuleScope } from '@quadnix/octo';
import { CloudFrontFunctionSchema } from './index.schema.js';

/**
 * The marker closing the multi-line string the code is written in.
 *
 * @internal
 */
const CODE_DELIMITER = 'OCTO_CLOUDFRONT_FUNCTION_CODE';

/**
 * @internal
 */
@Resource<CloudFrontFunction>('@octo', 'cloudfront-function', CloudFrontFunctionSchema, {
  uniqueProperties: [{ path: 'name', within: ['awsAccountId'] }],
})
export class CloudFrontFunction extends ATerraformResource<CloudFrontFunctionSchema, CloudFrontFunction> {
  declare parents: [];
  declare properties: CloudFrontFunctionSchema['properties'];
  declare response: CloudFrontFunctionSchema['response'];

  /**
   * @internal
   */
  constructor(resourceId: string, properties: CloudFrontFunctionSchema['properties']) {
    super(resourceId, properties, []);
  }

  /**
   * The name is in the resource id, so only the account can make a function a different one. Its code
   * changes in place.
   *
   * @internal
   */
  override async diffProperties(previous: CloudFrontFunction): Promise<Diff[]> {
    if (previous.properties.awsAccountId !== this.properties.awsAccountId) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'a function belongs to one account; a change recreates it',
        ),
      ];
    }

    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [new Diff(this, DiffAction.UPDATE, 'properties', this.properties)];
    }

    return [];
  }

  /**
   * @internal
   */
  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const functionOctoResource = terraform.addOctoTerraformResource(this as CloudFrontFunction, {
      provider: { accountId: this.properties.awsAccountId },
    });

    // Write the code as a multi-line string, escaping the `${` and `%{` terraform would read as its own.
    const code = this.properties.code
      .replace(/\n$/, '')
      .replace(/\$\{/g, () => '$${')
      .replace(/%\{/g, () => '%%{');
    const functionTFResource = functionOctoResource.addTerraformResource('aws_cloudfront_function', this.resourceId, {
      code: terraform.raw(`<<-${CODE_DELIMITER}\n${code}\n${CODE_DELIMITER}`),
      name: this.properties.name,
      publish: true,
      runtime: 'cloudfront-js-2.0',
    });

    functionOctoResource.output({ Arn: terraform.raw(`${functionTFResource.address}.arn`) });
  }
}
