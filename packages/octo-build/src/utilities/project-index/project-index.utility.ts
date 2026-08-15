import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Keeps `src/index.ts` - the file an app's definition points at with
 * `importPath: "./dist/index.js"` - in step with what the generators have written.
 *
 * Without this, every `create-*` command produced a construct that nothing reached. A module was not
 * exported, so the definition could not name it; a resource and its actions were never imported, so
 * their decorators never ran and nothing was registered. Both compile and both load: an unresolved
 * *side-effect* import is not a type error, and a construct that is simply never imported is not an
 * error at all. The failure surfaces much later, as a module that cannot be found or an action that
 * never fires.
 */
export class ProjectIndexUtility {
  private static readonly HEADER = [
    '/**',
    ' * Custom Octo constructs for this app.',
    ' *',
    ' * The `create-*` commands maintain this file. Modules are exported because the definition file',
    ' * names them; everything else is imported for the registration side effect its decorator',
    ' * performs, which is what makes a construct known to Octo at boot.',
    ' */',
    '',
  ].join('\n');

  /**
   * Adds a re-export for a construct the definition file names by class - modules, in practice.
   */
  static addExport(projectRootDir: string, className: string, modulePath: string): boolean {
    return ProjectIndexUtility.addEntry(projectRootDir, `export { ${className} } from '${modulePath}';`);
  }

  /**
   * Adds a side-effect import (`import './x.js';`) for a construct that only needs registering.
   */
  static addImport(projectRootDir: string, modulePath: string): boolean {
    return ProjectIndexUtility.addEntry(projectRootDir, `import '${modulePath}';`);
  }

  /**
   * @returns Whether the file was changed - false when the entry was already there, or when there is
   * no `src` directory to own an index (a construct generated into something that is not an app).
   */
  private static addEntry(projectRootDir: string, entry: string): boolean {
    const sourceDir = resolve(join(projectRootDir, 'src'));
    if (!existsSync(sourceDir)) {
      return false;
    }

    const indexPath = join(sourceDir, 'index.ts');
    const contents = existsSync(indexPath) ? readFileSync(indexPath, 'utf-8') : ProjectIndexUtility.HEADER;
    if (contents.includes(entry)) {
      return false;
    }

    const lines = contents.split('\n');
    const imports = lines.filter((line) => line.startsWith('import '));
    const exports = lines.filter((line) => line.startsWith('export ') && line !== 'export {};');
    // Everything that is neither: the header comment, and any hand-written code below it. Trailing
    // blank lines go with it and are normalized away when the file is rebuilt.
    const preamble = lines
      .filter((line) => !line.startsWith('import ') && !line.startsWith('export '))
      .join('\n')
      .trim();

    if (entry.startsWith('import ')) {
      imports.push(entry);
    } else {
      exports.push(entry);
    }

    const blocks = [preamble, imports.sort().join('\n'), exports.sort().join('\n')].filter(Boolean);
    writeFileSync(indexPath, blocks.join('\n\n') + '\n');

    return true;
  }
}
