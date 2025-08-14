import Generator, { type BaseOptions } from 'yeoman-generator';

export default class extends Generator {
  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    // Define arguments
    this.argument('name', {
      default: 'World',
      description: 'Name to use in the hello message',
      required: true,
      type: String,
    });
  }

  writing(): void {
    const name = 'hello';

    // Create hello.ts file
    this.fs.write(
      this.destinationPath('hello.ts'),
      this.fs.read(this.templatePath('hello.ts.ejs'))!.replace('<%= name %>', name),
    );
  }

  end(): void {
    this.log('✅ hello.ts file has been generated successfully!');
  }
}
