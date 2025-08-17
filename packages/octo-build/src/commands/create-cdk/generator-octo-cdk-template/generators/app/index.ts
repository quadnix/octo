import { readdir, stat } from 'fs/promises';
import type { Stats } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';

export default class extends Generator {
  private readonly cdkName: string;
  private readonly cdkOptions: { withExamples: boolean };
  private readonly cdkPath: string;

  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    this.cdkName = args[0];
    this.cdkPath = args[1];
    this.cdkOptions = {
      withExamples: args[2] === 'true',
    };
  }

  async initializing(): Promise<void> {
    const targetPath = resolve(join(this.cdkPath, this.cdkName));

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

    // Set the destination root to the cdk directory.
    this.destinationRoot(targetPath);
  }

  async writing(): Promise<void> {
    // Create eslint.config.js (ESLint v9 flat config)
    this.fs.copyTpl(this.templatePath('eslint.config.js.ejs'), this.destinationPath('eslint.config.js'));

    // Create .gitignore
    this.fs.copyTpl(this.templatePath('gitignore.ejs'), this.destinationPath('.gitignore'));

    // Create package.json
    this.fs.copyTpl(this.templatePath('package.json.ejs'), this.destinationPath('package.json'), {
      description: `Infrastructure CDK using Octo for ${this.cdkName}`,
      name: this.cdkName,
      version: '0.0.1',
    });
    await this.addDependencies({
      '@quadnix/octo': '0.0.x',
    });
    await this.addDevDependencies({
      '@eslint/js': '^9.33.0',
      '@types/jest': '^30.0.0',
      '@types/node': '^24.3.0',
      '@typescript-eslint/eslint-plugin': '^8.39.1',
      '@typescript-eslint/parser': '^8.39.1',
      dpdm: '^3.14.0',
      eslint: '^9.33.0',
      'eslint-config-prettier': '^10.1.8',
      'eslint-import-resolver-typescript': '^4.4.4',
      'eslint-plugin-boundaries': '^5.0.1',
      'eslint-plugin-import': '^2.32.0',
      'eslint-plugin-jsonc': '^2.20.1',
      'eslint-plugin-prettier': '^5.5.4',
      globals: '^16.3.0',
      jest: '^30.0.5',
      prettier: '^3.6.2',
      rimraf: '^6.0.1',
      'source-map-support': '^0.5.21',
      'ts-jest': '^29.4.1',
      'ts-loader': '^9.5.2',
      'ts-node': '^10.9.2',
      'tsconfig-paths': '^4.2.0',
      typescript: '^5.9.2',
    });

    // Create .prettierrc
    this.fs.copyTpl(this.templatePath('prettierrc.ejs'), this.destinationPath('.prettierrc'));

    // Create README.md
    this.fs.copyTpl(this.templatePath('README.md.ejs'), this.destinationPath('README.md'), {
      description: `Infrastructure CDK using Octo for ${this.cdkName}`,
      name: this.cdkName,
    });

    // Create tsconfig.json and tsconfig.build.json
    this.fs.copyTpl(this.templatePath('tsconfig.json.ejs'), this.destinationPath('tsconfig.json'));
    this.fs.copyTpl(this.templatePath('tsconfig.build.json.ejs'), this.destinationPath('tsconfig.build.json'));

    // Create src directory and main files
    if (this.cdkOptions.withExamples) {
      this.fs.copyTpl(this.templatePath(`src/**/*`), this.destinationPath('src'), {
        name: this.cdkName,
      });
    } else {
      this.fs.copyTpl(this.templatePath(`gitkeep.ejs`), this.destinationPath('src/anchors/.gitkeep'));
      this.fs.copyTpl(this.templatePath(`gitkeep.ejs`), this.destinationPath('src/factories/.gitkeep'));
      this.fs.copyTpl(this.templatePath(`gitkeep.ejs`), this.destinationPath('src/modules/.gitkeep'));
      this.fs.copyTpl(this.templatePath(`gitkeep.ejs`), this.destinationPath('src/resources/.gitkeep'));
      this.fs.copyTpl(this.templatePath(`gitkeep.ejs`), this.destinationPath('src/utilities/.gitkeep'));
    }
  }

  end(): void {
    const targetPath = resolve(join(this.cdkPath, this.cdkName));

    this.log('✅ Your TypeScript CDK has been generated successfully!');
    this.log(`📁 CDK created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   cd ${targetPath}`);
    this.log('   npm install');
    this.log('   npm run build');
  }
}
