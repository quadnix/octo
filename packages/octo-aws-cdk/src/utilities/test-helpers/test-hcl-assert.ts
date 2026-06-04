import type { OctoTerraform } from '../../factories/octo-terraform.factory.js';

/**
 * A parsed snapshot of non-blacklisted HCL blocks.
 * Keys are block addresses (e.g. `resource.aws_vpc.vpc-name`);
 * values map top-level property names to their normalized HCL values.
 */
export type HclShape = Record<string, Record<string, string>>;

/**
 * `HclAssert` provides assertion helpers for the HCL string produced by
 * {@link OctoTerraform.render}.
 *
 * Pass the factory and a hand-written baseline shape, then call {@link assert} after
 * each commit. Each call re-renders, compares against the stored baseline via Jest's
 * `expect`, and advances the baseline to the current render:
 * ```ts
 * const hcl = new HclAssert(octoTerraform, baseShape);
 * hcl.assert();           // expects HCL == baseShape, advances baseline
 * hcl.assert(newShape);   // expects HCL == newShape, advances baseline
 * ```
 *
 * @internal
 */
export class HclAssert {
  constructor(
    private readonly octoTerraform: OctoTerraform,
    private readonly baseline: HclShape,
  ) {}

  /** Asserts the current render matches the baseline shape passed to the constructor. */
  assert(): this {
    const current = this.parseShape(this.octoTerraform.render());
    expect(current).toEqual(this.baseline);
    this.octoTerraform.reset();
    return this;
  }

  /** Asserts the current render matches an explicit shape, for cases where the HCL differs from the baseline. */
  assertShape(expectedShape: HclShape): this {
    const current = this.parseShape(this.octoTerraform.render());
    expect(current).toEqual(expectedShape);
    this.octoTerraform.reset();
    return this;
  }

  private parseShape(rendered: string): HclShape {
    const shape: HclShape = {};
    for (const address of this.extractAddresses(rendered)) {
      const block = this.extractBlock(this.addressToKeyword(address), rendered);
      const props = this.extractProperties(block);
      shape[address] = Object.fromEntries(props.map((p) => [p.key, this.normalizeValue(p.value)]));
    }
    return shape;
  }

  private addressToKeyword(address: string): string {
    const [type, ...rest] = address.split('.');
    if (type === 'resource') return `resource "${rest[0]}" "${rest[1]}"`;
    if (type === 'output') return `output "${rest[0]}"`;
    if (type === 'data') return `data "${rest[0]}" "${rest[1]}"`;
    throw new Error(`Unsupported block type in address: "${address}".`);
  }

  private extractAddresses(rendered: string): string[] {
    const addresses: string[] = [];
    for (const [, type, name] of rendered.matchAll(/^resource "([^"]+)" "([^"]+)" \{/gm)) {
      addresses.push(`resource.${type}.${name}`);
    }
    for (const [, name] of rendered.matchAll(/^output "([^"]+)" \{/gm)) {
      addresses.push(`output.${name}`);
    }
    for (const [, type, name] of rendered.matchAll(/^data "([^"]+)" "([^"]+)" \{/gm)) {
      addresses.push(`data.${type}.${name}`);
    }
    return addresses;
  }

  private extractBlock(startKeyword: string, rendered: string): string {
    const escaped = startKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped} \\{`, 'm');
    const match = pattern.exec(rendered);
    if (!match) {
      throw new Error(`Block "${startKeyword}" not found in rendered HCL.`);
    }

    let depth = 0;
    for (let i = match.index; i < rendered.length; i++) {
      if (rendered[i] === '{') depth++;
      else if (rendered[i] === '}') {
        depth--;
        if (depth === 0) return rendered.slice(match.index, i + 1);
      }
    }
    throw new Error(`Un-closed block "${startKeyword}" in rendered HCL.`);
  }

  private extractProperties(blockContent: string): { key: string; value: string }[] {
    const properties: { key: string; value: string }[] = [];
    let depth = 0;
    let firstLine = true;

    for (const line of blockContent.split('\n')) {
      if (firstLine) {
        firstLine = false;
        continue;
      }

      const opens = (line.match(/\{/g) ?? []).length;
      const closes = (line.match(/}/g) ?? []).length;

      if (depth === 0) {
        const match = line.match(/^\s+(\w+)\s*=\s*(.+)$/);
        if (match) {
          properties.push({ key: match[1], value: match[2].trim() });
        }
      }

      depth += opens - closes;
      if (depth < 0) break;
    }

    return properties;
  }

  private normalizeValue(hclValue: string): string {
    if (hclValue.startsWith('"') && hclValue.endsWith('"')) {
      return hclValue.slice(1, -1);
    }
    return hclValue;
  }
}
