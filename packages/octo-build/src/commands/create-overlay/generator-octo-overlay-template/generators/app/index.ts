import { readdir, stat } from 'fs/promises';
import type { Stats } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';
import { StringUtility } from '../../../../../utilities/string/string.utility.js';

export default class extends Generator {
  private readonly moduleName: string;
  private readonly modulePath: string;
  private readonly moduleType: string;
  private readonly overlayName: string;
  private readonly packageName: string;

  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    this.moduleName = args[0];
    this.moduleType = args[1];
    this.packageName = args[2];
    this.overlayName = args[3];
    this.modulePath = args[4];
  }

  async initializing(): Promise<void> {
    const targetPath = resolve(
      join(
        this.modulePath,
        'src',
        'modules',
        this.moduleType,
        this.moduleName,
        'overlays',
        `${this.moduleName}-${this.overlayName}`,
      ),
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

    // Set the destination root to the overlay directory.
    this.destinationRoot(targetPath);
  }

  async writing(): Promise<void> {
    // Create the overlay file.
    this.fs.copyTpl(
      this.templatePath('overlays/overlay/overlay.ts.ejs'),
      this.destinationPath(`${this.moduleName}-${this.overlayName}.overlay.ts`),
      {
        moduleName: this.moduleName,
        moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
        overlayName: this.overlayName,
        overlayNamePascal: StringUtility.toPascalCase(this.overlayName),
        packageName: this.packageName,
      },
    );

    // Create schema file.
    this.fs.copyTpl(
      this.templatePath('overlays/overlay/overlay.schema.ts.ejs'),
      this.destinationPath(`${this.moduleName}-${this.overlayName}.schema.ts`),
      {
        moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
        overlayNamePascal: StringUtility.toPascalCase(this.overlayName),
      },
    );

    // Create index.ts
    this.fs.copyTpl(this.templatePath('overlays/overlay/index.ts.ejs'), this.destinationPath('index.ts'), {
      moduleName: this.moduleName,
      moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
      overlayName: this.overlayName,
      overlayNamePascal: StringUtility.toPascalCase(this.overlayName),
    });

    // Create actions directory and action file
    this.fs.copyTpl(
      this.templatePath('overlays/overlay/actions/add.overlay.action.ts.ejs'),
      this.destinationPath('actions', `add-${this.moduleName}-${this.overlayName}.overlay.action.ts`),
      {
        moduleName: this.moduleName,
        moduleNamePascal: StringUtility.toPascalCase(this.moduleName),
        overlayName: this.overlayName,
        overlayNamePascal: StringUtility.toPascalCase(this.overlayName),
      },
    );
  }

  end(): void {
    const targetPath = resolve(
      join(
        this.modulePath,
        'src',
        'modules',
        this.moduleType,
        this.moduleName,
        'overlays',
        `${this.moduleName}-${this.overlayName}`,
      ),
    );

    this.log('✅ Your overlay has been generated successfully!');
    this.log(`📁 Overlay created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   Address all "Fix me" in generated files`);
  }
}
