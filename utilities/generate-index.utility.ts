import { unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'path';
import { sync } from 'glob';

const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2) {
  console.error('Usage: ts-node generate-index.utility.ts <src_dir> [--rm]');
  process.exit(1);
}

const baseDir = resolve(process.cwd(), args[0]);
const indexPath = join(baseDir, 'index.ts');
const shouldRemove = args[1]?.toLowerCase() === '--rm';

if (shouldRemove) {
  console.log(`INFO: Removing index.ts in ${baseDir}`);

  try {
    unlinkSync(indexPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
} else {
  console.log(`INFO: Generating index.ts in ${baseDir}`);

  const tsFiles = sync('**/*.ts', {
    absolute: false,
    cwd: baseDir,
    ignore: ['**/*.d.ts', '**/*.spec.ts', '**/index.ts', '**/index.schema.ts'],
  });

  const exportLines = tsFiles.map((file) => {
    const withoutExt = file.replace(/\.ts$/, '');
    return `export * from './${withoutExt}.js';`;
  });

  writeFileSync(indexPath, exportLines.join('\n') + '\n');
}
