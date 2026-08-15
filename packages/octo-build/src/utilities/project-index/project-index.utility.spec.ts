import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectIndexUtility } from './project-index.utility.js';

describe('ProjectIndexUtility UT', () => {
  let projectRootDir: string;

  const indexContents = (): string => readFileSync(join(projectRootDir, 'src', 'index.ts'), 'utf-8');

  beforeEach(() => {
    projectRootDir = mkdtempSync(join(tmpdir(), 'octo-project-index-'));
    mkdirSync(join(projectRootDir, 'src'));
  });

  afterEach(() => {
    rmSync(projectRootDir, { force: true, recursive: true });
  });

  it('should create the index when the app has none yet', () => {
    expect(ProjectIndexUtility.addImport(projectRootDir, './resources/my-thing/index.js')).toBe(true);

    expect(indexContents()).toContain("import './resources/my-thing/index.js';");
  });

  // A construct generated into something that is not an app has no index to own, and inventing one
  // would put a stray file wherever the command happened to run.
  it('should do nothing when there is no src directory', () => {
    rmSync(join(projectRootDir, 'src'), { recursive: true });

    expect(ProjectIndexUtility.addImport(projectRootDir, './resources/my-thing/index.js')).toBe(false);
  });

  it('should not add the same entry twice', () => {
    ProjectIndexUtility.addImport(projectRootDir, './resources/my-thing/index.js');

    expect(ProjectIndexUtility.addImport(projectRootDir, './resources/my-thing/index.js')).toBe(false);
    expect(indexContents().match(/my-thing/g)).toHaveLength(1);
  });

  it('should keep imports and exports in their own sorted blocks', () => {
    ProjectIndexUtility.addImport(projectRootDir, './resources/zebra/index.js');
    ProjectIndexUtility.addExport(projectRootDir, 'AlphaModule', './modules/service/alpha/index.js');
    ProjectIndexUtility.addImport(projectRootDir, './resources/alpha/index.js');

    expect(indexContents()).toBe(
      [
        '/**',
        ' * Custom Octo constructs for this app.',
        ' *',
        ' * The `create-*` commands maintain this file. Modules are exported because the definition file',
        ' * names them; everything else is imported for the registration side effect its decorator',
        ' * performs, which is what makes a construct known to Octo at boot.',
        ' */',
        '',
        "import './resources/alpha/index.js';",
        "import './resources/zebra/index.js';",
        '',
        "export { AlphaModule } from './modules/service/alpha/index.js';",
        '',
      ].join('\n'),
    );
  });

  // The generated app ships a header comment and a placeholder `export {}`. The comment is the author's
  // and survives; the placeholder is not an export and would be redundant beside a real one.
  it('should keep the header comment and drop the placeholder export', () => {
    writeFileSync(
      join(projectRootDir, 'src', 'index.ts'),
      ['/**', ' * Custom Octo constructs for this app.', ' */', '', 'export {};', ''].join('\n'),
    );

    ProjectIndexUtility.addExport(projectRootDir, 'MyModule', './modules/service/my/index.js');

    expect(indexContents()).toBe(
      [
        '/**',
        ' * Custom Octo constructs for this app.',
        ' */',
        '',
        "export { MyModule } from './modules/service/my/index.js';",
        '',
      ].join('\n'),
    );
  });
});
