import { writeFile } from 'node:fs/promises';
import { join } from 'path';
import { type AResource, type BaseResourceSchema, Factory, MatchingResource, type ResourceSchema } from '@quadnix/octo';

type LazyValue = (indent: string, step: string) => string;

type TerraformType = 'any' | 'bool' | 'list' | 'map' | 'number' | 'object' | 'set' | 'string' | 'tuple';

interface TerraformLiteralObject {
  [key: string]: TerraformLiteralType;
}
type TerraformLiteralType = string | number | boolean | null | TerraformLiteralType[] | TerraformLiteralObject;

function raw(value: unknown): string {
  return `__RAW__${value}`;
}

class TerraformValue {
  constructor(public readonly value: unknown) {}

  render(): string {
    let value: string;

    if (typeof this.value === 'string' && this.value.startsWith('__RAW__')) {
      value = this.value.replace('__RAW__', '');
    } else if (typeof this.value === 'string') {
      value = `"${this.value}"`;
    } else if (Array.isArray(this.value)) {
      value = `[${this.value.map((v) => new TerraformValue(v).render()).join(', ')}]`;
    } else if (typeof this.value === 'object' && this.value !== null) {
      const entries = Object.entries(this.value as Record<string, unknown>).map(
        ([k, v]) => `${k} = ${new TerraformValue(v).render()}`,
      );
      value = `{ ${entries.join(', ')} }`;
    } else if (typeof this.value === 'function') {
      // For standalone render calls, we default to no indent and 2 spaces.
      value = (this.value as LazyValue)('', '  ');
    } else {
      value = `${this.value}`;
    }

    return value;
  }
}

class TerraformAttribute {
  constructor(
    private readonly key: string,
    private readonly value: TerraformValue,
  ) {}

  render(indent: string, step: string): string {
    const renderedValue =
      typeof this.value.value === 'function' ? (this.value.value as LazyValue)(indent, step) : this.value.render();

    return `${indent}${this.key} = ${renderedValue}`;
  }
}

class TerraformBlock {
  private readonly children: (TerraformAttribute | TerraformBlock)[] = [];

  constructor(private readonly type: string) {}

  attribute(key: string, value: unknown): void {
    this.children.push(new TerraformAttribute(key, new TerraformValue(value)));
  }

  block(type: string): TerraformBlock {
    const newBlock = new TerraformBlock(type);
    this.children.push(newBlock);
    return newBlock;
  }

  render(indent: string, step: string): string {
    const childIndent = indent + step;
    const childrenRendered = this.children.map((child) => child.render(childIndent, step));
    return `${indent}${this.type} {\n${childrenRendered.join('\n')}\n${indent}}`;
  }
}

class TerraformOutput {
  constructor(
    private readonly name: string,
    private readonly value: TerraformValue,
  ) {}

  render(step: string): string {
    const renderedValue =
      typeof this.value.value === 'function' ? (this.value.value as LazyValue)(step, step) : this.value.render();
    const body = [`${step}value = ${renderedValue}`];
    return `output "${this.name}" {\n${body.join('\n')}\n}`;
  }
}

class TerraformResource {
  private readonly children: (TerraformAttribute | TerraformBlock)[] = [];

  constructor(
    private readonly type: string,
    private readonly name: string,
    private readonly dependsOn: string[],
  ) {}

  get address(): string {
    return `${this.type}.${this.name}`;
  }

  attribute(key: string, value: unknown): void {
    this.children.push(new TerraformAttribute(key, new TerraformValue(value)));
  }

  block(type: string): TerraformBlock {
    const newBlock = new TerraformBlock(type);
    this.children.push(newBlock);
    return newBlock;
  }

  render(step: string): string {
    const childrenRendered = this.children.map((child) => child.render(step, step));
    const dependsOnRendered =
      this.dependsOn.length > 0 ? `${step}depends_on = [${this.dependsOn.join(', ')}]` : undefined;

    return `resource "${this.type}" "${this.name}" {\n${childrenRendered.join(
      '\n',
    )}${dependsOnRendered ? `\n\n${dependsOnRendered}` : ''}\n}`;
  }
}

class TerraformVariable {
  constructor(
    private readonly name: string,
    private readonly typeExpression: LazyValue | string,
    private readonly options: { default: TerraformLiteralType; sensitive: boolean },
  ) {}

  get ref(): string {
    return raw(`var.${this.name}`);
  }

  render(step: string): string {
    const body: string[] = [];

    // Render type.
    const renderedType =
      typeof this.typeExpression === 'function'
        ? (this.typeExpression as LazyValue)(step, step)
        : this.typeExpression.startsWith('__RAW__')
          ? this.typeExpression.replace('__RAW__', '')
          : `"${this.typeExpression}"`;
    body.push(`${step}type = ${renderedType}`);

    body.push(`${step}default = ${new TerraformValue(this.options.default).render()}`);

    // Render sensitive.
    if (this.options.sensitive) {
      body.push(`${step}sensitive = true`);
    }

    return `variable "${this.name}" {\n${body.join('\n')}\n}`;
  }
}

class OctoTerraformResource<TResponse extends BaseResourceSchema['response'] = BaseResourceSchema['response']> {
  public readonly terraformResources: TerraformResource[] = [];
  public readonly terraformResourceRefs: Partial<Record<keyof TResponse, string>> = {};
  private readonly terraformOutputs: TerraformOutput[] = [];

  constructor(
    private readonly dependsOn: string[] = [],
    private readonly providerAlias?: string,
  ) {}

  addTerraformResource(type: string, name: string, spec: Record<string, unknown> = {}): TerraformResource {
    const intraResourceDependencies =
      this.terraformResources.length === 0 ? [] : [this.terraformResources[this.terraformResources.length - 1].address];

    const terraformResource = new TerraformResource(type, name, [...this.dependsOn, ...intraResourceDependencies]);
    if (this.providerAlias && !('provider' in spec)) {
      terraformResource.attribute('provider', raw(`aws.${this.providerAlias}`));
    }
    this.addTerraformResourceSpec(terraformResource, spec);

    this.terraformResources.push(terraformResource);
    return terraformResource;
  }

  private addTerraformResourceSpec(target: TerraformResource | TerraformBlock, spec: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(spec)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.addTerraformResourceSpec(target.block(key), value as Record<string, unknown>);
      } else if (
        Array.isArray(value) &&
        value!.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))
      ) {
        for (const item of value) {
          this.addTerraformResourceSpec(target.block(key), item as Record<string, unknown>);
        }
      } else {
        target.attribute(key, value);
      }
    }
  }

  output(outputs: Record<keyof TResponse & string, string>): void {
    for (const [name, value] of Object.entries(outputs)) {
      this.terraformResourceRefs[name as keyof TResponse] = value;
      this.terraformOutputs.push(new TerraformOutput(name, new TerraformValue(value)));
    }
  }

  render(step: string): string {
    const resources = this.terraformResources.map((resource) => resource.render(step)).join('\n\n');
    const outputs = this.terraformOutputs.map((output) => output.render(step)).join('\n\n');
    return [resources, outputs].filter(Boolean).join('\n\n');
  }
}

export class OctoTerraform {
  private readonly terraformConfig: TerraformBlock = new TerraformBlock('terraform');
  private readonly terraformProviders: Map<string, TerraformBlock> = new Map();
  private readonly awsAccountIdToAlias: Map<string, string> = new Map();
  private readonly octoTerraformResources: Record<string, OctoTerraformResource> = {};
  private readonly terraformVariables: Record<string, TerraformVariable> = {};

  constructor(
    private readonly octoTerraformFilePath: string = '',
    private readonly octoTerraformFileIndentLength: number = 2,
  ) {}

  addOctoTerraformResource<T extends AResource<BaseResourceSchema, any>>(
    octoResource: T,
    explicitParents: (AResource<BaseResourceSchema, any> | MatchingResource<BaseResourceSchema>)[] = [],
  ): OctoTerraformResource<ResourceSchema<T>['response']> {
    if (octoResource.resourceId in this.octoTerraformResources) {
      throw new Error(`Resource with ID ${octoResource.resourceId} already exists in Terraform!`);
    }

    const dependsOn: string[] = [];
    for (const parentResource of explicitParents) {
      const parentResourceId =
        parentResource instanceof MatchingResource
          ? parentResource.getSchemaInstanceInResourceAction().resourceId
          : parentResource.resourceId;
      if (parentResourceId in this.octoTerraformResources) {
        dependsOn.push(...this.octoTerraformResources[parentResourceId].terraformResources.map((r) => r.address));
      }
    }

    const awsAccountId = (octoResource.properties as Record<string, unknown>)?.['awsAccountId'] as string | undefined;
    const providerAlias = awsAccountId ? this.awsAccountIdToAlias.get(awsAccountId) : undefined;

    const newResource = new OctoTerraformResource<ResourceSchema<T>['response']>(dependsOn, providerAlias);
    this.octoTerraformResources[octoResource.resourceId] = newResource;
    return newResource;
  }

  addTerraformConfig({
    minAwsProviderVersion = '5.0',
    minTerraformVersion = '1.6.0',
  }: {
    minAwsProviderVersion?: string;
    minTerraformVersion?: string;
  } = {}): void {
    this.terraformConfig.attribute('required_version', `>= ${minTerraformVersion}`);

    const requiredProviders = this.terraformConfig.block('required_providers');
    requiredProviders.attribute('aws', (indent: string, step: string) => {
      const nextIndent = indent + step;
      return `{\n${nextIndent}source  = "hashicorp/aws"\n${nextIndent}version = ">= ${minAwsProviderVersion}"\n${indent}}`;
    });
  }

  addTerraformProvider(awsAccountId: string, alias: string, spec: Record<string, unknown> = {}): void {
    this.awsAccountIdToAlias.set(awsAccountId, alias);

    if (!this.terraformProviders.has(alias)) {
      const providerBlock = new TerraformBlock('provider "aws"');
      providerBlock.attribute('alias', alias);
      for (const [k, v] of Object.entries(spec)) {
        providerBlock.attribute(k, v);
      }
      this.terraformProviders.set(alias, providerBlock);
    }
  }

  getRef<T extends AResource<BaseResourceSchema, any>>(
    resource: T,
    key: keyof ResourceSchema<T>['response'] & string,
  ): string {
    const octoTerraformResource = this.octoTerraformResources[resource.resourceId];
    if (!octoTerraformResource) {
      throw new Error(`Resource "${resource.resourceId}" not found in Octo Terraform!`);
    }

    const expression = octoTerraformResource.terraformResourceRefs[key];
    if (expression === undefined) {
      throw new Error(`Ref "${key}" not registered for resource "${resource.resourceId}" in Octo Terraform!`);
    }

    return expression;
  }

  jsonencode(subject: object): LazyValue {
    return (currentIndent: string, step: string) => {
      const formatValue = (value: unknown, indent: string): string => {
        if (typeof value === 'string' && value.startsWith('__RAW__')) {
          return value.replace('__RAW__', '');
        }

        if (typeof value === 'string') return `"${value}"`;
        if (typeof value !== 'object' || value === null) return String(value);

        const nextIndent = indent + step;

        if (Array.isArray(value)) {
          if (value.length === 0) return '[]';
          const items = value.map((v) => formatValue(v, nextIndent)).join(', ');
          return `[${items}]`;
        }

        const entries = Object.entries(value).map(([k, v]) => {
          const key = /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(k) ? k : `"${k}"`;
          return `${nextIndent}${key} = ${formatValue(v, nextIndent)}`;
        });

        return `{\n${entries.join('\n')}\n${indent}}`;
      };

      const innerIndent = currentIndent + step;
      const body = Object.entries(subject)
        .map(([k, v]) => `${innerIndent}${k} = ${formatValue(v, innerIndent)}`)
        .join('\n');

      return `jsonencode({\n${body}\n${currentIndent}})`;
    };
  }

  raw(value: unknown): string {
    return raw(value);
  }

  render(): string {
    const step = ' '.repeat(this.octoTerraformFileIndentLength);

    const configBlock = this.terraformConfig.render('', step);

    const providers = [...this.terraformProviders.values()].map((block) => block.render('', step)).join('\n\n');

    const variables = Object.values(this.terraformVariables)
      .map((variable) => variable.render(step))
      .join('\n\n');

    const resources = Object.values(this.octoTerraformResources)
      .map((resource) => resource.render(step))
      .join('\n\n');

    return [configBlock, providers, variables, resources].filter(Boolean).join('\n\n');
  }

  type(schema: unknown): LazyValue {
    return (currentIndent: string, step: string) => {
      const formatType = (value: unknown, indent: string): string => {
        // Handle strings that are already raw/resolved.
        if (typeof value === 'string' && value.startsWith('__RAW__')) {
          return value.replace('__RAW__', '');
        }

        // Resolve nested lazy types.
        if (typeof value === 'function') {
          return value(indent, step);
        }

        const primitives: TerraformType[] = ['any', 'bool', 'number', 'string'];
        if (primitives.includes(value as TerraformType)) {
          return value as string;
        }

        if (Array.isArray(value)) {
          return `list(${formatType(value[0], indent)})`;
        }

        if (typeof value === 'object' && value !== null) {
          const nextIndent = indent + step;
          const fields = Object.entries(value).map(([k, v]) => {
            return `${nextIndent}${k} = ${formatType(v, nextIndent)}`;
          });

          return `object({\n${fields.join('\n')}\n${indent}})`;
        }

        return String(value);
      };

      return formatType(schema, currentIndent);
    };
  }

  variable(
    name: string,
    typeExpression: unknown,
    options: { default: TerraformLiteralType; sensitive: boolean },
  ): TerraformVariable {
    const resolvedType =
      typeof typeExpression === 'string' && !['any', 'bool', 'number', 'string'].includes(typeExpression)
        ? this.raw(typeExpression)
        : this.type(typeExpression);

    const variable = new TerraformVariable(name, resolvedType, options);
    this.terraformVariables[name] = variable;
    return variable;
  }

  async write(): Promise<void> {
    await writeFile(this.octoTerraformFilePath, this.render(), 'utf-8');
  }
}

@Factory<OctoTerraform>(OctoTerraform, { metadata: { package: '@octo' } })
export class OctoTerraformFactory {
  private static instance: OctoTerraform;

  static async create(
    {
      terraformFileIndentLength = 2,
      terraformFilePath = '',
    }: {
      terraformFileIndentLength?: number;
      terraformFilePath?: string;
    } = {},
    forceNew: boolean = false,
  ): Promise<OctoTerraform> {
    if (!this.instance || forceNew) {
      if (!terraformFilePath) {
        terraformFilePath = join(process.cwd(), 'octo-terraform.tf');
      }

      this.instance = new OctoTerraform(terraformFilePath, terraformFileIndentLength);
    }

    return this.instance;
  }
}
