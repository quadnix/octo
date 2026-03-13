import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { dirname, join } from 'path';
import { type AResource, type BaseResourceSchema, Factory, MatchingResource } from '@quadnix/octo';

type LazyValue = (indent: string, step: string) => string;

type TerraformType = 'any' | 'bool' | 'list' | 'map' | 'number' | 'object' | 'set' | 'string' | 'tuple';

type SerializedTerraformAttribute = {
  expression: string;
  key: string;
};

type SerializedTerraformBlock = {
  attributes: SerializedTerraformAttribute[];
  blocks: SerializedTerraformBlock[];
  type: string;
};

type SerializedTerraformOutput = {
  expression: string;
  name: string;
};

type SerializedTerraformResource = {
  attributes: SerializedTerraformAttribute[];
  blocks: SerializedTerraformBlock[];
  dependsOn: string[];
  name: string;
  octoResourceId: string;
  outputs: SerializedTerraformOutput[];
  type: string;
};

type SerializedTerraformVariable = {
  defaultExpression: string;
  name: string;
  sensitive: boolean;
  typeExpression: string;
};

type SerializedOctoTerraform = {
  octoTerraformApplyEnabled: boolean;
  octoTerraformFileIndentLength: number;
  octoTerraformFilePath: string;
  octoTerraformManifestFilePath: string;
  terraformResources: SerializedTerraformResource[];
  terraformVariables: SerializedTerraformVariable[];
};

class TerraformValue {
  constructor(public readonly value: unknown) {}

  render(): string {
    let value: string;

    if (typeof this.value === 'string' && this.value.startsWith('__RAW__')) {
      value = this.value.replace('__RAW__', '');
    } else if (typeof this.value === 'string') {
      value = `"${this.value}"`;
    } else if (Array.isArray(this.value)) {
      value = `[${this.value.map((v) => (typeof v === 'string' ? `"${v}"` : v)).join(', ')}]`;
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

  toJSON(indent: string, step: string): SerializedTerraformAttribute {
    const renderedValue =
      typeof this.value.value === 'function' ? (this.value.value as LazyValue)(indent, step) : this.value.render();

    return {
      expression: renderedValue,
      key: this.key,
    };
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

  toJSON(indent: string, step: string): SerializedTerraformBlock {
    const childIndent = indent + step;
    const attributes: SerializedTerraformAttribute[] = [];
    const blocks: SerializedTerraformBlock[] = [];

    for (const child of this.children) {
      if (child instanceof TerraformAttribute) {
        attributes.push(child.toJSON(childIndent, step));
      } else {
        blocks.push(child.toJSON(childIndent, step));
      }
    }

    return {
      attributes,
      blocks,
      type: this.type,
    };
  }
}

class TerraformOutput {
  constructor(
    private readonly name: string,
    private readonly value: TerraformValue,
  ) {}

  get address(): string {
    return this.name;
  }

  get defaultValue(): string {
    return this.value.render();
  }

  render(step: string): string {
    const renderedValue =
      typeof this.value.value === 'function' ? (this.value.value as LazyValue)(step, step) : this.value.render();
    const body = [`${step}value = ${renderedValue}`];
    return `output "${this.name}" {\n${body.join('\n')}\n}`;
  }

  toJSON(step: string): SerializedTerraformOutput {
    const renderedValue =
      typeof this.value.value === 'function' ? (this.value.value as LazyValue)(step, step) : this.value.render();

    return {
      expression: renderedValue,
      name: this.name,
    };
  }
}

class TerraformResource {
  private readonly children: (TerraformAttribute | TerraformBlock)[] = [];
  public readonly terraformOutputs: TerraformOutput[] = [];

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

  output(name: string, value: unknown): TerraformOutput {
    const newOutput = new TerraformOutput(name, new TerraformValue(value));
    this.terraformOutputs.push(newOutput);
    return newOutput;
  }

  render(step: string): string {
    const childrenRendered = this.children.map((child) => child.render(step, step));
    const dependsOnRendered =
      this.dependsOn.length > 0 ? `${step}depends_on = [${this.dependsOn.join(', ')}]` : undefined;

    return [
      `resource "${this.type}" "${this.name}" {\n${childrenRendered.join(
        '\n',
      )}${dependsOnRendered ? `\n\n${dependsOnRendered}` : ''}\n}`,
      ...this.terraformOutputs.map((output) => output.render(step)),
    ].join('\n\n');
  }

  toJSON(step: string, octoResourceId: string): SerializedTerraformResource {
    const attributes: SerializedTerraformAttribute[] = [];
    const blocks: SerializedTerraformBlock[] = [];

    for (const child of this.children) {
      if (child instanceof TerraformAttribute) {
        attributes.push(child.toJSON(step, step));
      } else {
        blocks.push(child.toJSON(step, step));
      }
    }

    return {
      attributes,
      blocks,
      dependsOn: [...this.dependsOn],
      name: this.name,
      octoResourceId,
      outputs: this.terraformOutputs.map((output) => output.toJSON(step)),
      type: this.type,
    };
  }
}

class TerraformVariable {
  constructor(
    private readonly name: string,
    private readonly typeExpression: LazyValue | string,
    private readonly options: { default: unknown; sensitive: boolean },
  ) {}

  get ref(): string {
    return `__RAW__var.${this.name}`;
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

    // Render default value.
    let renderedDefault: string;
    if (typeof this.options.default === 'function') {
      renderedDefault = (this.options.default as LazyValue)(step, step);
    } else {
      renderedDefault = new TerraformValue(this.options.default).render();
    }
    body.push(`${step}default = ${renderedDefault}`);

    // Render sensitive.
    if (this.options.sensitive) {
      body.push(`${step}sensitive = true`);
    }

    return `variable "${this.name}" {\n${body.join('\n')}\n}`;
  }

  toJSON(step: string): SerializedTerraformVariable {
    let renderedType: string;
    if (typeof this.typeExpression === 'function') {
      renderedType = (this.typeExpression as LazyValue)(step, step);
    } else if (this.typeExpression.startsWith('__RAW__')) {
      renderedType = this.typeExpression.replace('__RAW__', '');
    } else {
      renderedType = `"${this.typeExpression}"`;
    }

    let renderedDefault: string;
    if (typeof this.options.default === 'function') {
      renderedDefault = (this.options.default as LazyValue)(step, step);
    } else {
      renderedDefault = new TerraformValue(this.options.default).render();
    }

    return {
      defaultExpression: renderedDefault,
      name: this.name,
      sensitive: this.options.sensitive,
      typeExpression: renderedType,
    };
  }
}

class OctoTerraformResource {
  public readonly terraformResources: TerraformResource[] = [];

  constructor(private readonly dependsOn: string[] = []) {}

  addTerraformResource(type: string, name: string): TerraformResource {
    const intraResourceDependencies =
      this.terraformResources.length === 0 ? [] : [this.terraformResources[this.terraformResources.length - 1].address];
    const terraformResource = new TerraformResource(type, name, [...this.dependsOn, ...intraResourceDependencies]);
    this.terraformResources.push(terraformResource);
    return terraformResource;
  }

  render(step: string): string {
    return this.terraformResources.map((resource) => resource.render(step)).join('\n\n');
  }

  toJSON(step: string, octoResourceId: string): SerializedTerraformResource[] {
    return this.terraformResources.map((resource) => resource.toJSON(step, octoResourceId));
  }
}

export class OctoTerraform {
  private readonly octoTerraformResources: Record<string, OctoTerraformResource> = {};
  private readonly terraformVariables: Record<string, TerraformVariable> = {};

  constructor(
    private readonly octoTerraformFilePath: string = '',
    private readonly octoTerraformManifestFilePath: string = '',
    private readonly octoTerraformFileIndentLength: number = 2,
    private readonly octoTerraformApplyEnabled: boolean = true,
  ) {}

  addOctoTerraformResource<T extends AResource<BaseResourceSchema, any>>(octoResource: T): OctoTerraformResource {
    if (octoResource.resourceId in this.octoTerraformResources) {
      throw new Error(`Resource with ID ${octoResource.resourceId} already exists in Terraform!`);
    }

    const dependsOn: string[] = [];
    for (const parentResource of octoResource.parents) {
      const parentResourceId =
        parentResource instanceof MatchingResource
          ? parentResource.getSchemaInstanceInResourceAction().resourceId
          : parentResource.resourceId;
      if (parentResourceId in this.octoTerraformResources) {
        dependsOn.push(...this.octoTerraformResources[parentResourceId].terraformResources.map((r) => r.address));
      }
    }

    const newResource = new OctoTerraformResource(dependsOn);
    this.octoTerraformResources[octoResource.resourceId] = newResource;
    return newResource;
  }

  async apply(targetAddresses: string[] = []): Promise<Record<string, unknown>> {
    await this.write();

    if (!this.octoTerraformApplyEnabled) {
      const defaultOutputs: Record<string, unknown> = {};

      const octoTerraformResources = Object.values(this.octoTerraformResources);
      for (const octoTerraformResource of octoTerraformResources) {
        for (const terraformResource of octoTerraformResource.terraformResources) {
          for (const terraformOutput of terraformResource.terraformOutputs) {
            defaultOutputs[terraformOutput.address] = terraformOutput.defaultValue;
          }
        }
      }

      return defaultOutputs;
    }

    const targets = targetAddresses.map((address) => `-target=${address}`);
    const args = ['apply', ...targets, '-refresh=false', '-auto-approve', '-input=false'];

    const terraformApplyResponse = spawnSync('terraform', args, {
      cwd: dirname(this.octoTerraformFilePath),
      encoding: 'utf-8',
      env: { ...process.env, TF_IN_AUTOMATION: 'true' },
    });

    if (terraformApplyResponse.status !== 0) {
      throw new Error(`terraform apply failed! Error: ${terraformApplyResponse.stderr}`);
    }

    const terraformOutputResponse = spawnSync('terraform', ['output', '-json'], {
      cwd: dirname(this.octoTerraformFilePath),
      encoding: 'utf-8',
    });

    if (terraformOutputResponse.status !== 0) {
      throw new Error(`terraform output failed! Error: ${terraformOutputResponse.stderr}`);
    }

    const parsedTerraformOutputResponse = JSON.parse(terraformOutputResponse.stdout);
    return Object.keys(parsedTerraformOutputResponse).reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = parsedTerraformOutputResponse[key].value;
      return accumulator;
    }, {});
  }

  static deserialize(serialized: SerializedOctoTerraform): OctoTerraform {
    const terraform = new OctoTerraform(
      serialized.octoTerraformFilePath,
      serialized.octoTerraformManifestFilePath,
      serialized.octoTerraformFileIndentLength,
      serialized.octoTerraformApplyEnabled,
    );

    for (const variable of serialized.terraformVariables) {
      terraform.terraformVariables[variable.name] = new TerraformVariable(
        variable.name,
        terraform.raw(variable.typeExpression),
        {
          default: terraform.raw(variable.defaultExpression),
          sensitive: variable.sensitive,
        },
      );
    }

    const deserializeBlock = (
      serializedBlock: SerializedTerraformBlock,
      parent: TerraformBlock | TerraformResource,
    ): void => {
      const block = parent.block(serializedBlock.type);
      for (const attribute of serializedBlock.attributes) {
        block.attribute(attribute.key, terraform.raw(attribute.expression));
      }
      for (const childBlock of serializedBlock.blocks) {
        deserializeBlock(childBlock, block);
      }
    };

    for (const resource of serialized.terraformResources) {
      const terraformResource = new TerraformResource(resource.type, resource.name, resource.dependsOn);

      for (const attribute of resource.attributes) {
        terraformResource.attribute(attribute.key, terraform.raw(attribute.expression));
      }
      for (const block of resource.blocks) {
        deserializeBlock(block, terraformResource);
      }
      for (const output of resource.outputs) {
        terraformResource.output(output.name, terraform.raw(output.expression));
      }

      if (!(resource.octoResourceId in terraform.octoTerraformResources)) {
        terraform.octoTerraformResources[resource.octoResourceId] = new OctoTerraformResource(resource.dependsOn);
      }

      terraform.octoTerraformResources[resource.octoResourceId].terraformResources.push(terraformResource);
    }

    return terraform;
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
    return `__RAW__${value}`;
  }

  render(): string {
    const step = ' '.repeat(this.octoTerraformFileIndentLength);

    const variables = Object.values(this.terraformVariables)
      .map((variable) => variable.render(step))
      .join('\n\n');

    const resources = Object.values(this.octoTerraformResources)
      .map((resource) => resource.render(step))
      .join('\n\n');

    return [variables, resources].filter(Boolean).join('\n\n');
  }

  serialize(): SerializedOctoTerraform {
    const step = ' '.repeat(this.octoTerraformFileIndentLength);

    const terraformVariables = Object.values(this.terraformVariables).map((variable) => variable.toJSON(step));

    const terraformResources = Object.entries(this.octoTerraformResources).flatMap(([id, resource]) =>
      resource.toJSON(step, id),
    );

    return {
      octoTerraformApplyEnabled: this.octoTerraformApplyEnabled,
      octoTerraformFileIndentLength: this.octoTerraformFileIndentLength,
      octoTerraformFilePath: this.octoTerraformFilePath,
      octoTerraformManifestFilePath: this.octoTerraformManifestFilePath,
      terraformResources,
      terraformVariables,
    };
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
    options: { default: unknown; sensitive: boolean },
  ): TerraformVariable {
    const resolvedType =
      typeof typeExpression === 'string' && !['any', 'bool', 'number', 'string'].includes(typeExpression)
        ? this.raw(typeExpression)
        : this.type(typeExpression);

    const variable = new TerraformVariable(name, resolvedType, options);
    this.terraformVariables[name] = variable;
    return variable;
  }

  private async write(): Promise<void> {
    await writeFile(this.octoTerraformFilePath, this.render(), 'utf-8');
    await writeFile(this.octoTerraformManifestFilePath, JSON.stringify(this.serialize(), null, 2), 'utf-8');
  }
}

@Factory<OctoTerraform>(OctoTerraform, { metadata: { package: '@octo' } })
export class OctoTerraformFactory {
  private static instance: OctoTerraform;

  static async create(
    {
      deserializeFromManifest = true,
      terraformApplyEnabled = true,
      terraformFileIndentLength = 2,
      terraformFilePath = '',
    }: {
      deserializeFromManifest?: boolean;
      terraformApplyEnabled?: boolean;
      terraformFileIndentLength?: number;
      terraformFilePath?: string;
    } = {},
    forceNew: boolean = false,
  ): Promise<OctoTerraform> {
    if (!this.instance || forceNew) {
      if (!terraformFilePath) {
        terraformFilePath = join(process.cwd(), 'octo-terraform.tf');
      }
      const terraformManifestFilePath = join(
        dirname(terraformFilePath),
        basename(terraformFilePath).replace(/\.tf$/, '') + '.manifest.json',
      );

      if (deserializeFromManifest) {
        try {
          const content = await readFile(terraformManifestFilePath, 'utf-8');
          this.instance = OctoTerraform.deserialize(JSON.parse(content));
        } catch (error) {
          if (error.code === 'ENOENT') {
            this.instance = new OctoTerraform(
              terraformFilePath,
              terraformManifestFilePath,
              terraformFileIndentLength,
              terraformApplyEnabled,
            );
          } else {
            throw error;
          }
        }
      } else {
        this.instance = new OctoTerraform(
          terraformFilePath,
          terraformManifestFilePath,
          terraformFileIndentLength,
          terraformApplyEnabled,
        );
      }
    }

    return this.instance;
  }
}
