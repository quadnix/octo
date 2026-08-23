type TerraformType = 'any' | 'bool' | 'list' | 'map' | 'number' | 'object' | 'set' | 'string' | 'tuple';

/**
 * The terraform variable holding the octo project root.
 *
 * A generated folder names files on the developer's disk relative to this variable rather than by
 * absolute path, so the same intent renders the same text on every machine. Octo supplies the value
 * as `TF_VAR_OCTO_PROJECT_ROOT` on every terragrunt command it runs.
 */
export const PROJECT_ROOT_VARIABLE_NAME = 'OCTO_PROJECT_ROOT';

export type TerraformLiteralType =
  | string
  | number
  | boolean
  | null
  | TerraformLiteralType[]
  | { [key: string]: TerraformLiteralType };

export interface RenderContext {
  resolveRef(ref: RefHclNode): string;

  step: string;
}

/**
 * @internal
 */
export function toHclNode(value: unknown): HclExpression {
  if (value instanceof HclExpression) {
    return value;
  }
  if (Array.isArray(value)) {
    return new ListHclNode(value.map(toHclNode));
  }
  if (value !== null && typeof value === 'object') {
    return new MapHclNode(Object.entries(value).map(([k, v]) => [k, toHclNode(v)]));
  }
  return new LiteralHclNode(value as string | number | boolean | null | undefined);
}

/**
 * A rendered terraform expression.
 *
 * You never construct one directly - {@link TerraformModuleScope}'s `raw()`, `jsonencode()`,
 * `mapAttr()`, `type()`, and `getRef()` return them, and you pass them back as attribute values.
 *
 * @group Resources
 */
export abstract class HclExpression {
  /**
   * @internal
   */
  collectRefs(_into: RefHclNode[]): void {}

  abstract render(indent: string, context: RenderContext): string;
}

/**
 * @internal
 */
export class ExpressionHclNode extends HclExpression {
  /**
   * @internal
   */
  constructor(private readonly text: string) {
    super();
  }

  /**
   * Renders the expression verbatim. e.g. `aws_vpc.my-vpc.id`.
   */
  override render(): string {
    return this.text;
  }
}

/**
 * @internal
 */
export class InterpolatedStringHclNode extends HclExpression {
  /**
   * @internal
   */
  constructor(private readonly parts: (string | HclExpression)[]) {
    super();
  }

  /**
   * @internal
   */
  override collectRefs(into: RefHclNode[]): void {
    this.parts.forEach((p) => {
      if (p instanceof HclExpression) {
        p.collectRefs(into);
      }
    });
  }

  /**
   * Renders a quoted terraform string built from text parts and embedded `${...}` expressions,
   * e.g. the `local-exec` command of an external resource wrapper:
   * `"octo ... --input my-vpc.VpcId=${var.my_vpc_VpcId} > ..."`.
   */
  override render(indent: string, context: RenderContext): string {
    const content = this.parts.map((p) => (typeof p === 'string' ? p : `\${${p.render(indent, context)}}`)).join('');
    return `"${content}"`;
  }
}

/**
 * @internal
 */
export class JsonEncodeHclNode extends HclExpression {
  /**
   * @internal
   */
  constructor(private readonly subject: object | unknown[]) {
    super();
  }

  /**
   * @internal
   */
  override collectRefs(into: RefHclNode[]): void {
    const walk = (value: unknown): void => {
      if (value instanceof HclExpression) {
        value.collectRefs(into);
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value !== null && typeof value === 'object') {
        Object.values(value).forEach(walk);
      }
    };
    walk(this.subject);
  }

  /**
   * Renders a `jsonencode({...})` call. The subject is a plain JS structure;
   * leaf values may be {@link HclExpression} nodes, which render as expressions inside the encoded object.
   */
  override render(currentIndent: string, context: RenderContext): string {
    const formatValue = (value: unknown, indent: string): string => {
      if (value instanceof HclExpression) {
        return value.render(indent, context);
      }

      if (typeof value === 'string') {
        return `"${value}"`;
      }
      if (typeof value !== 'object' || value === null) {
        return String(value);
      }

      const nextIndent = indent + context.step;

      if (Array.isArray(value)) {
        if (value.length === 0) {
          return '[]';
        }
        const items = value.map((v) => formatValue(v, nextIndent)).join(', ');
        return `[${items}]`;
      }

      const entries = Object.entries(value).map(([k, v]) => {
        const key = /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(k) ? k : `"${k}"`;
        return `${nextIndent}${key} = ${formatValue(v, nextIndent)}`;
      });

      return `{\n${entries.join('\n')}\n${indent}}`;
    };

    const innerIndent = currentIndent + context.step;

    if (Array.isArray(this.subject)) {
      if (this.subject.length === 0) {
        return 'jsonencode([])';
      }
      const items = this.subject.map((v: unknown) => `${innerIndent}${formatValue(v, innerIndent)}`).join('\n');
      return `jsonencode([\n${items}\n${currentIndent}])`;
    }

    const body = Object.entries(this.subject)
      .map(([k, v]) => `${innerIndent}${k} = ${formatValue(v, innerIndent)}`)
      .join('\n');

    return `jsonencode({\n${body}\n${currentIndent}})`;
  }
}

/**
 * @internal
 */
export class ListHclNode extends HclExpression {
  /**
   * @internal
   */
  constructor(private readonly items: HclExpression[]) {
    super();
  }

  /**
   * @internal
   */
  override collectRefs(into: RefHclNode[]): void {
    this.items.forEach((i) => i.collectRefs(into));
  }

  /**
   * Renders a `[a, b, c]` list value in a single-line;
   * items render with the current indent.
   */
  override render(indent: string, context: RenderContext): string {
    return `[${this.items.map((i) => i.render(indent, context)).join(', ')}]`;
  }
}

/**
 * @internal
 */
export class LiteralHclNode extends HclExpression {
  /**
   * @internal
   */
  constructor(private readonly value: boolean | number | null | string | undefined) {
    super();
  }

  /**
   * Renders string with quotes, other values verbatim.
   */
  override render(): string {
    return typeof this.value === 'string' ? `"${this.value}"` : `${this.value}`;
  }
}

/**
 * @internal
 */
export class MapHclNode extends HclExpression {
  /**
   * @internal
   */
  constructor(private readonly entries: [string, HclExpression][]) {
    super();
  }

  /**
   * @internal
   */
  override collectRefs(into: RefHclNode[]): void {
    this.entries.forEach(([, v]) => v.collectRefs(into));
  }

  /**
   * Renders a `{ key = value }` map value, one entry per line.
   * This is a map ATTRIBUTE (`key = { }`),
   * not a block (`key { }`) - see {@link TerraformService.mapAttr} for the distinction.
   */
  override render(indent: string, context: RenderContext): string {
    const nextIndent = indent + context.step;
    const entries = this.entries.map(([k, v]) => `${nextIndent}${k} = ${v.render(nextIndent, context)}`);
    return `{\n${entries.join('\n')}\n${indent}}`;
  }
}

/**
 * @internal
 */
export class MapHclNodeRaw extends HclExpression {
  /**
   * @internal
   */
  constructor(private readonly lines: string[]) {
    super();
  }

  /**
   * Renders a brace-wrapped body with pre-rendered lines,
   * used for `required_providers` entries where the `source =` alignment is part of the expected output.
   */
  override render(indent: string, context: RenderContext): string {
    const nextIndent = indent + context.step;
    return `{\n${this.lines.map((l) => `${nextIndent}${l}`).join('\n')}\n${indent}}`;
  }
}

/**
 * This is the deferred cross-reference primitive in the terraform layer.
 * When one resource needs another resource's output,
 * we can't write the final HCL until every resource has been registered
 * to find out if the producer is in the same module folder or different one.
 * It is a placeholder that stands in for "resource X's response key Y" and gets resolved to HCL at the very end.
 *
 * - `entireResponse`: A normal RefHclNode targets one key (vpc-1.VpcId).
 * When true, the ref points at the producer's entire response map rather than a single key (and `key` is empty).
 * Used to feed an external resource's whole result into a child external resource's inputs.
 * The map is wrapped in `jsonencode(...)` so it survives as a single string argument/trigger value.
 */
export class RefHclNode extends HclExpression {
  /**
   * @internal
   */
  constructor(
    readonly resourceId: string,
    readonly key: string,
    readonly entireResponse: boolean = false,
  ) {
    super();
  }

  /**
   * @internal
   */
  override collectRefs(into: RefHclNode[]): void {
    into.push(this);
  }

  /**
   * Renders a reference to a resource's response key whose final form is unknown until render time:
   * same folder → the producer's native expression; other folder → a `var.*` wired through terragrunt.
   * This is what `getRef()` returns. Resolution happens via {@link RenderContext.resolveRef}.
   */
  override render(_indent: string, context: RenderContext): string {
    const resolved = context.resolveRef(this);
    return this.entireResponse ? `jsonencode(${resolved})` : resolved;
  }
}

/**
 * @internal
 */
export class TypeHclNode extends HclExpression {
  /**
   * @internal
   */
  constructor(private readonly schema: unknown) {
    super();
  }

  /**
   * Renders a terraform type expression for `variable` declarations:
   * - primitives render bare (`string`),
   * - arrays render as `list(...)`,
   * - objects as `object({ ... })`.
   */
  override render(currentIndent: string, context: RenderContext): string {
    const formatType = (value: unknown, indent: string): string => {
      if (value instanceof HclExpression) {
        return value.render(indent, context);
      }

      const primitives: TerraformType[] = ['any', 'bool', 'number', 'string'];
      if (primitives.includes(value as TerraformType)) {
        return value as string;
      }

      if (Array.isArray(value)) {
        return `list(${formatType(value[0], indent)})`;
      }

      if (typeof value === 'object' && value !== null) {
        const nextIndent = indent + context.step;
        const fields = Object.entries(value).map(([k, v]) => {
          return `${nextIndent}${k} = ${formatType(v, nextIndent)}`;
        });

        return `object({\n${fields.join('\n')}\n${indent}})`;
      }

      return String(value);
    };

    return formatType(this.schema, currentIndent);
  }
}

/**
 * @internal
 */
export class TerraformAttribute {
  /**
   * @internal
   */
  constructor(
    private readonly key: string,
    private readonly value: HclExpression,
  ) {}

  /**
   * @internal
   */
  collectRefs(into: RefHclNode[]): void {
    this.value.collectRefs(into);
  }

  /**
   * Renders `<indent><key> = <value>`.
   */
  render(indent: string, context: RenderContext): string {
    return `${indent}${this.key} = ${this.value.render(indent, context)}`;
  }
}

/**
 * A nested `<type> { ... }` block inside a resource or data source.
 *
 * @group Resources
 */
export class TerraformBlock {
  private readonly children: (TerraformAttribute | TerraformBlock)[] = [];

  /**
   * @internal
   */
  constructor(private readonly type: string) {}

  /**
   * Sets an argument on this block. The value is converted to HCL, so a plain JS value works as
   * well as an {@link HclExpression}.
   */
  attribute(key: string, value: unknown): void {
    this.children.push(new TerraformAttribute(key, toHclNode(value)));
  }

  /**
   * Opens a nested block, e.g. `image_scanning_configuration { ... }`.
   */
  block(type: string): TerraformBlock {
    const newBlock = new TerraformBlock(type);
    this.children.push(newBlock);
    return newBlock;
  }

  /**
   * @internal
   */
  collectRefs(into: RefHclNode[]): void {
    this.children.forEach((c) => c.collectRefs(into));
  }

  /**
   * Renders a generic `<type> { ...children... }` block, e.g. `provider "aws"` or `triggers`.
   * Prints the block with children one indent step deeper.
   */
  render(indent: string, context: RenderContext): string {
    const childIndent = indent + context.step;
    const childrenRendered = this.children.map((child) => child.render(childIndent, context));
    return `${indent}${this.type} {\n${childrenRendered.join('\n')}\n${indent}}`;
  }
}

/**
 * A `data "<type>" "<name>"` source, as returned by {@link TerraformModuleScope.addTerraformData}.
 *
 * @group Resources
 */
export class TerraformData {
  private readonly children: (TerraformAttribute | TerraformBlock)[] = [];

  /**
   * @internal
   */
  private get address(): string {
    return `data.${this.type}.${this.name}`;
  }

  /**
   * @internal
   */
  constructor(
    private readonly type: string,
    private readonly name: string,
  ) {}

  /**
   * Sets an argument on this block. The value is converted to HCL, so a plain JS value works as
   * well as an {@link HclExpression}.
   */
  attribute(key: string, value: unknown): void {
    this.children.push(new TerraformAttribute(key, toHclNode(value)));
  }

  /**
   * Opens a nested block, e.g. `image_scanning_configuration { ... }`.
   */
  block(type: string): TerraformBlock {
    const newBlock = new TerraformBlock(type);
    this.children.push(newBlock);
    return newBlock;
  }

  /**
   * @internal
   */
  collectRefs(into: RefHclNode[]): void {
    this.children.forEach((c) => c.collectRefs(into));
  }

  /**
   * Returns an expression referencing an attribute of this data source.
   */
  ref(attribute: string): HclExpression {
    return new ExpressionHclNode(`${this.address}.${attribute}`);
  }

  /**
   * Renders a `data "<type>" "<name>" { ... }` source.
   * E.g. `data.external.my-name { ... }`
   */
  render(context: RenderContext): string {
    const childrenRendered = this.children.map((child) => child.render(context.step, context));
    return `data "${this.type}" "${this.name}" {\n${childrenRendered.join('\n')}\n}`;
  }
}

/**
 * @internal
 */
export class TerraformOutput {
  /**
   * @internal
   */
  constructor(
    private readonly name: string,
    private readonly value: HclExpression,
    private readonly sensitive: boolean = false,
  ) {}

  /**
   * Renders an `output "<name>" { value = ... }` block. Marks the output `sensitive = true`
   * when it carries a secret, which Terraform requires for any root output containing sensitive data.
   */
  render(context: RenderContext): string {
    const body = [`${context.step}value = ${this.value.render(context.step, context)}`];
    if (this.sensitive) {
      body.push(`${context.step}sensitive = true`);
    }
    return `output "${this.name}" {\n${body.join('\n')}\n}`;
  }
}

/**
 * A `resource "<type>" "<name>"` block, as returned by
 * {@link OctoTerraformResourceScope.addTerraformResource}.
 *
 * @group Resources
 */
export class TerraformResource {
  /**
   * The terraform address of this resource, `<type>.<name>`. Interpolate it to reference an
   * attribute terraform only knows after an apply.
   */
  get address(): string {
    return `${this.type}.${this.name}`;
  }

  private readonly children: (TerraformAttribute | TerraformBlock)[] = [];

  /**
   * @internal
   */
  constructor(
    private readonly type: string,
    private readonly name: string,
    private readonly intraDependsOn: string[], // Each intra TF resource of an octo resource depends on previous one.
  ) {}

  /**
   * Sets an argument on this block. The value is converted to HCL, so a plain JS value works as
   * well as an {@link HclExpression}.
   */
  attribute(key: string, value: unknown): void {
    this.children.push(new TerraformAttribute(key, toHclNode(value)));
  }

  /**
   * Opens a nested block, e.g. `image_scanning_configuration { ... }`.
   */
  block(type: string): TerraformBlock {
    const newBlock = new TerraformBlock(type);
    this.children.push(newBlock);
    return newBlock;
  }

  /**
   * @internal
   */
  collectRefs(into: RefHclNode[]): void {
    this.children.forEach((c) => c.collectRefs(into));
  }

  /**
   * Renders a `resource "<type>" "<name>" { ... }` block.
   *
   * There are 3 types of dependencies a terraform resource can have - intra, same folder parent, cross folder parent.
   * - A cross folder parent is represented using TerraGrunt's dependency block - no depends_on needed.
   * - `parentDependsOn` carries the same folder addresses of the octo resource's explicit parents
   * derived in wiring phase. These are dependencies that cannot be captured by attribute references alone.
   * E.g. between vpc and igw.
   * - intra-resource dependencies are between two terraform resources produced by the same octo resource.
   * E.g. between s3 bucket and s3 policy.
   *
   * The parentDependsOn and intraDependsOn are merged into one `depends_on` list.
   */
  render(context: RenderContext, parentDependsOn: string[] = []): string {
    const childrenRendered = this.children.map((child) => child.render(context.step, context));
    const dependsOn = [...parentDependsOn, ...this.intraDependsOn];
    const dependsOnRendered =
      dependsOn.length > 0 ? `${context.step}depends_on = [${dependsOn.join(', ')}]` : undefined;

    return `resource "${this.type}" "${this.name}" {\n${childrenRendered.join(
      '\n',
    )}${dependsOnRendered ? `\n\n${dependsOnRendered}` : ''}\n}`;
  }
}

/**
 * A module input variable, as returned by {@link TerraformModuleScope.variable}.
 *
 * @group Resources
 */
export class TerraformVariable {
  /**
   * Returns the `var.<name>` expression for consuming this variable.
   */
  get ref(): HclExpression {
    return new ExpressionHclNode(`var.${this.name}`);
  }

  /**
   * @internal
   */
  constructor(
    private readonly name: string,
    private readonly typeExpression: HclExpression,
    private readonly options: { default: TerraformLiteralType; sensitive: boolean },
  ) {}

  /**
   * @internal
   */
  collectRefs(into: RefHclNode[]): void {
    this.typeExpression.collectRefs(into);
  }

  /**
   * Renders a `variable "<name>" { type, default, sensitive }` declaration (user-defined variables).
   */
  render(context: RenderContext): string {
    const body: string[] = [];
    body.push(`${context.step}type = ${this.typeExpression.render(context.step, context)}`);
    body.push(`${context.step}default = ${toHclNode(this.options.default).render(context.step, context)}`);
    if (this.options.sensitive) {
      body.push(`${context.step}sensitive = true`);
    }
    return `variable "${this.name}" {\n${body.join('\n')}\n}`;
  }
}
