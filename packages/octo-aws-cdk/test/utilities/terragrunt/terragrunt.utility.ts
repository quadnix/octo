import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const IGNORED_DIRECTORIES = new Set(['.terraform', '.terragrunt-cache']);

const RESOURCE_BLOCK_REGEX = /resource\s+"([^"]+)"\s+"([^"]+)"/g;

export class TerragruntUtility {
  /**
   * Walks `workingDir` and returns every Terraform resource address (`<type>.<name>`) declared
   * across its `.tf` files. A pure text scan — no terraform process involved — so module e2e
   * specs can assert on generated HCL shape without a real `terraform`/`terragrunt` round-trip.
   */
  static async collectTerraformResources(workingDir: string): Promise<string[]> {
    const resources: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { encoding: 'utf8', withFileTypes: true }).catch((error) => {
        if (error.code === 'ENOENT') {
          return []; // generateHcl wrote nothing — an empty tree is the expected result here.
        }
        throw error;
      });

      for (const entry of entries) {
        const entryPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) {
            await walk(entryPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.tf')) {
          const contents = await readFile(entryPath, 'utf8');
          for (const match of contents.matchAll(RESOURCE_BLOCK_REGEX)) {
            resources.push(`${match[1]}.${match[2]}`);
          }
        }
      }
    };

    await walk(workingDir);
    return resources;
  }
}
