import type { OctoTerraform } from '../../factories/octo-terraform.factory.js';

type HclBlock = { [key: string]: string | HclBlock | HclBlock[] };
type HclShape = Record<string, HclBlock>;

export class HclAssert {
  private lastKnown: HclShape = {};

  constructor(private readonly octoTerraform: OctoTerraform) {}

  digest(): string[] {
    const current = this.parseShape(this.octoTerraform.render());

    const added: [string, { blocks: number; properties: number }][] = [];
    const deleted: [string, { blocks: number; properties: number }][] = [];
    const updated: [string, { blocks: number; properties: number }][] = [];

    for (const [address, block] of Object.entries(current)) {
      if (!(address in this.lastKnown)) {
        added.push([address, this.countBlock(block)]);
      } else if (JSON.stringify(block) !== JSON.stringify(this.lastKnown[address])) {
        updated.push([address, this.countChanges(block, this.lastKnown[address])]);
      }
    }
    for (const address of Object.keys(this.lastKnown)) {
      if (!(address in current)) deleted.push([address, this.countBlock(this.lastKnown[address])]);
    }

    this.lastKnown = { ...current };
    this.octoTerraform.reset();

    const format = (prefix: string, address: string, c: { blocks: number; properties: number }): string =>
      `${prefix} ${address} | blocks: ${c.blocks} | properties: ${c.properties}`;
    const byAddress = ([a]: [string, unknown], [b]: [string, unknown]): number => a.localeCompare(b);

    return [
      ...added.sort(byAddress).map(([address, c]) => format('+', address, c)),
      ...deleted.sort(byAddress).map(([address, c]) => format('-', address, c)),
      ...updated.sort(byAddress).map(([address, c]) => format('~', address, c)),
    ];
  }

  private addressToKeyword(address: string): string {
    const [type, ...rest] = address.split('.');
    if (type === 'resource') return `resource "${rest[0]}" "${rest[1]}"`;
    if (type === 'output') return `output "${rest[0]}"`;
    if (type === 'data') return `data "${rest[0]}" "${rest[1]}"`;
    if (type === 'variable') return `variable "${rest[0]}"`;
    throw new Error(`Unsupported block type in address: "${address}".`);
  }

  private countBlock(block: HclBlock): { blocks: number; properties: number } {
    let properties = 0,
      blocks = 0;
    for (const v of Object.values(block)) {
      if (typeof v === 'string') properties++;
      else blocks++;
    }
    return { blocks, properties };
  }

  private countChanges(current: HclBlock, previous: HclBlock): { blocks: number; properties: number } {
    let properties = 0,
      blocks = 0;
    const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
    for (const key of keys) {
      if (JSON.stringify(current[key]) !== JSON.stringify(previous[key])) {
        if (typeof current[key] === 'string' || typeof previous[key] === 'string') properties++;
        else blocks++;
      }
    }
    return { blocks, properties };
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
    for (const [, name] of rendered.matchAll(/^variable "([^"]+)" \{/gm)) {
      addresses.push(`variable.${name}`);
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

  private normalizeValue(hclValue: string): string {
    if (hclValue.startsWith('"') && hclValue.endsWith('"')) {
      return hclValue.slice(1, -1);
    }
    return hclValue;
  }

  private parseBlockLines(lines: string[]): HclBlock {
    const result: HclBlock = {};
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      const assignedBlockMatch = line.match(/^\s+(\w+)\s*=\s*\{/);
      if (assignedBlockMatch) {
        const blockKey = assignedBlockMatch[1];
        let depth = 0;
        let end = lines.length - 1;
        for (let j = i; j < lines.length; j++) {
          depth += (lines[j].match(/\{/g) ?? []).length;
          depth -= (lines[j].match(/}/g) ?? []).length;
          if (depth === 0) {
            end = j;
            break;
          }
        }
        const nested = this.parseBlockLines(lines.slice(i + 1, end));
        const existing = result[blockKey];
        if (existing !== undefined) {
          if (Array.isArray(existing)) {
            existing.push(nested);
          } else {
            result[blockKey] = [existing as HclBlock, nested];
          }
        } else {
          result[blockKey] = nested;
        }
        i = end + 1;
        continue;
      }

      const kvMatch = line.match(/^\s+(\w+)\s*=\s*(.+)$/);
      if (kvMatch) {
        result[kvMatch[1]] = this.normalizeValue(kvMatch[2].trim());
        i++;
        continue;
      }

      const blockMatch = line.match(/^\s+(\w+)(?:\s+"[^"]*")?\s*\{/);
      if (blockMatch) {
        const blockKey = blockMatch[1];
        let depth = 0;
        let end = lines.length - 1;
        for (let j = i; j < lines.length; j++) {
          depth += (lines[j].match(/\{/g) ?? []).length;
          depth -= (lines[j].match(/}/g) ?? []).length;
          if (depth === 0) {
            end = j;
            break;
          }
        }
        const nested = this.parseBlockLines(lines.slice(i + 1, end));

        const existing = result[blockKey];
        if (existing !== undefined) {
          if (Array.isArray(existing)) {
            existing.push(nested);
          } else {
            result[blockKey] = [existing as HclBlock, nested];
          }
        } else {
          result[blockKey] = nested;
        }

        i = end + 1;
        continue;
      }

      i++;
    }

    return result;
  }

  private parseShape(rendered: string): HclShape {
    const shape: HclShape = {};
    for (const address of this.extractAddresses(rendered)) {
      const block = this.extractBlock(this.addressToKeyword(address), rendered);
      const lines = block.split('\n');
      shape[address] = this.parseBlockLines(lines.slice(1, -1));
    }
    return shape;
  }
}
