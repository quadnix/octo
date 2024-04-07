(async () => {
  const { App, LocalStateProvider } = await import('@quadnix/octo');
  const { OctoAws, RegionId, S3StaticWebsiteService } = await import('@quadnix/octo-aws-cdk');
  const { join } = await import('path');

  const BUCKET_NAME = 'octo.quadnix.com';
  const websiteSourcePath = join(__dirname, '..', 'build');

  const octoAws = new OctoAws();
  await octoAws.initialize(new LocalStateProvider(__dirname));

  // Add website.
  const app = new App('octo-docs');
  const service = new S3StaticWebsiteService(RegionId.AWS_US_EAST_1A, BUCKET_NAME);
  app.addService(service);

  const diffs1 = await octoAws.diff(app);
  const generator1 = await octoAws.beginTransaction(diffs1);

  const modelTransactionResult1 = await generator1.next();
  await octoAws.commitTransaction(app, modelTransactionResult1.value);

  // Add files to website.
  await service.addSource(`${websiteSourcePath}`);

  const diffs2 = await octoAws.diff(app);
  const generator2 = await octoAws.beginTransaction(diffs2);

  const modelTransactionResult2 = await generator2.next();
  await octoAws.commitTransaction(app, modelTransactionResult2.value);
})();
