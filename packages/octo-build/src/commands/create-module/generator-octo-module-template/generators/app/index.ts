import { readdir, stat } from 'fs/promises';
import type { Stats } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';

export default class extends Generator {
  private readonly moduleName: string;
  private readonly modulePath: string;
  private readonly moduleType: string;
  private readonly packageName: string;

  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    this.moduleName = args[0];
    this.moduleType = args[1];
    this.packageName = args[2];
    this.modulePath = args[3];
  }

  async initializing(): Promise<void> {
    const targetPath = resolve(join(this.modulePath, 'src', 'modules', this.moduleType, this.moduleName));

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
      const files = await readdir(targetPath);
      if (files.length > 0) {
        throw new Error(
          `Directory '${targetPath}' already exists and is not empty! Please choose a different name or path.`,
        );
      }
    }

    // Set the destination root to the module directory.
    this.destinationRoot(targetPath);
  }

  async writing(): Promise<void> {
    // Create the module file
    this.fs.copyTpl(this.templatePath('module.ts.ejs'), this.destinationPath(`${this.moduleName}.module.ts`), {
      moduleNamePascal: this.toPascalCase(this.moduleName),
      moduleTypePascal: this.toPascalCase(this.moduleType),
      packageName: this.packageName,
    });

    // Create index.schema.ts
    this.fs.copyTpl(this.templatePath('index.schema.ts.ejs'), this.destinationPath('index.schema.ts'), {
      moduleNamePascal: this.toPascalCase(this.moduleName),
    });

    // Create index.ts
    this.fs.copyTpl(this.templatePath('index.ts.ejs'), this.destinationPath('index.ts'), {
      moduleName: this.moduleName,
      moduleNamePascal: this.toPascalCase(this.moduleName),
    });
  }

  end(): void {
    const targetPath = resolve(join(this.modulePath, 'src', 'modules', this.moduleType, this.moduleName));

    this.log('✅ Your module has been generated successfully!');
    this.log(`📁 Module created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   Update index.schema.ts`);
    this.log(`   Implement the logic in ${this.moduleName}.module.ts`);
  }

  private toPascalCase(subject: string): string {
    return subject
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
}
