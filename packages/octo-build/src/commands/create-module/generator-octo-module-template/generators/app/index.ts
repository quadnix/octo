import { readdir, stat } from 'fs/promises';
import type { Stats } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';
import { StringUtility } from '../../../../../utilities/string/string.utility.js';

export default class extends Generator {
  private readonly cdkRootDir: string;
  private readonly modelType: string;
  private readonly moduleName: string;
  private readonly packageName: string;

  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    this.moduleName = args[0];
    this.modelType = args[1];
    this.packageName = args[2];
    this.cdkRootDir = args[3];
  }

  async initializing(): Promise<void> {
    const targetPath = resolve(join(this.cdkRootDir, 'src', 'modules', this.modelType, this.moduleName));

    // Check if directory already exists and is not empty.
    let targetPathStat: Stats | undefined;
    try {
      targetPathStat = await stat(targetPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    if (targetPathStat?.isDirectory()) {
      const files = await readdir(targetPath, { withFileTypes: true });
      if (files.filter((f) => f.isFile()).length > 0) {
        throw new Error(`Directory '${targetPath}' already exists and is not empty!`);
      }
    }

    // Set the destination root to the module directory.
    this.destinationRoot(targetPath);
  }

  async writing(): Promise<void> {
    // Create the module file
    this.fs.copyTpl(this.templatePath('module.ts.ejs'), this.destinationPath(`${this.moduleName}.module.ts`), {
      modelTypePascal: StringUtility.toPascalCase(this.modelType),
      moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
      packageName: this.packageName,
    });

    // Create index.schema.ts
    this.fs.copyTpl(this.templatePath('index.schema.ts.ejs'), this.destinationPath('index.schema.ts'), {
      moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
    });

    // Create index.ts
    this.fs.copyTpl(this.templatePath('index.ts.ejs'), this.destinationPath('index.ts'), {
      moduleName: this.moduleName,
      moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
    });
  }

  end(): void {
    const targetPath = resolve(join(this.cdkRootDir, 'src', 'modules', this.modelType, this.moduleName));

    this.log('✅ Your module has been generated successfully!');
    this.log(`📁 Module created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   Update index.schema.ts`);
    this.log(`   Implement the logic in ${this.moduleName}.module.ts`);
  }
}
