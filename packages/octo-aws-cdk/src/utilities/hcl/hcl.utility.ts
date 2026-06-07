type HclBlock = { [key: string]: string | HclBlock | HclBlock[] };

export type HclShape = Record<string, HclBlock>;

/**
 * @internal
 */
export class HclUtility {
  private static addressToKeyword(address: string): string {
    const [type, ...rest] = address.split('.');

    if (type === 'resource') {
      return `resource "${rest[0]}" "${rest[1]}"`;
    }
    if (type === 'output') {
      return `output "${rest[0]}"`;
    }
    if (type === 'data') {
      return `data "${rest[0]}" "${rest[1]}"`;
    }
    if (type === 'variable') {
      return `variable "${rest[0]}"`;
    }
    throw new Error(`Unsupported block type in address: "${address}".`);
  }

  private static extractAddresses(rendered: string): string[] {
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

  private static extractBlock(startKeyword: string, rendered: string): string {
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

  private static normalizeValue(hclValue: string): string {
    if (hclValue.startsWith('"') && hclValue.endsWith('"')) {
      return hclValue.slice(1, -1);
    }
    return hclValue;
  }

  private static parseBlockLines(lines: string[]): HclBlock {
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

        const nested = HclUtility.parseBlockLines(lines.slice(i + 1, end));
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
        result[kvMatch[1]] = HclUtility.normalizeValue(kvMatch[2].trim());
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

        const nested = HclUtility.parseBlockLines(lines.slice(i + 1, end));
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

  static parse(rendered: string): HclShape {
    const shape: HclShape = {};

    for (const address of HclUtility.extractAddresses(rendered)) {
      const block = HclUtility.extractBlock(HclUtility.addressToKeyword(address), rendered);
      const lines = block.split('\n');
      shape[address] = HclUtility.parseBlockLines(lines.slice(1, -1));
    }

    return shape;
  }
}
