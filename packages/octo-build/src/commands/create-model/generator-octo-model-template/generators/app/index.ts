import { readdir, stat } from 'fs/promises';
import type { Stats } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';
import { StringUtility } from '../../../../../utilities/string/string.utility.js';

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
    const targetPath = resolve(
      join(this.modulePath, 'src', 'modules', this.moduleType, this.moduleName, 'models', this.moduleType),
    );

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
        throw new Error(`Directory '${targetPath}' already exists and is not empty!`);
      }
    }

    // Set the destination root to the model directory.
    this.destinationRoot(targetPath);
  }

  async writing(): Promise<void> {
    // Create the model file.
    this.fs.copyTpl(
      this.templatePath('models/model/model.ts.ejs'),
      this.destinationPath(`${this.moduleName}.model.ts`),
      {
        moduleName: this.moduleName,
        moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
        moduleType: this.moduleType,
        moduleTypePascal: StringUtility.toPascalCase(this.moduleType),
        packageName: this.packageName,
      },
    );

    // Create schema file.
    this.fs.copyTpl(
      this.templatePath('models/model/schema.ts.ejs'),
      this.destinationPath(`${this.moduleName}.schema.ts`),
      {
        moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
        moduleTypePascal: StringUtility.toPascalCase(this.moduleType),
      },
    );

    // Create index.ts
    this.fs.copyTpl(this.templatePath('models/model/index.ts.ejs'), this.destinationPath('index.ts'), {
      moduleName: this.moduleName,
      moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
    });

    // Create actions directory and action file
    this.fs.copyTpl(
      this.templatePath('models/model/actions/add.model.action.ts.ejs'),
      this.destinationPath('actions', `add-${this.moduleName}.model.action.ts`),
      {
        moduleName: this.moduleName,
        moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
        moduleType: this.moduleType,
      },
    );
  }

  end(): void {
    const targetPath = resolve(
      join(this.modulePath, 'src', 'modules', this.moduleType, this.moduleName, 'models', this.moduleType),
    );

    this.log('✅ Your model has been generated successfully!');
    this.log(`📁 Model created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   Address all "Fix me" in generated files`);
  }
}
