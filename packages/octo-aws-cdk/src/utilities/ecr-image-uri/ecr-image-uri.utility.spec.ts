import { EcrImageUriUtility } from './ecr-image-uri.utility.js';

describe('EcrImageUriUtility UT', () => {
  describe('parse()', () => {
    it('should return undefined for a URI that does not address ECR', () => {
      expect(EcrImageUriUtility.parse('nginx:1.27')).toBeUndefined();
      expect(EcrImageUriUtility.parse('docker.io/library/nginx:1.27')).toBeUndefined();
      expect(EcrImageUriUtility.parse('registry.example.com/quadnix/octo:0.0.1')).toBeUndefined();
    });

    it('should return undefined for an ECR URI carrying no tag', () => {
      expect(EcrImageUriUtility.parse('123456789012.dkr.ecr.us-east-1.amazonaws.com/quadnix/nginx')).toBeUndefined();
    });

    it('should read the repository and tag out of an ECR URI', () => {
      expect(EcrImageUriUtility.parse('123456789012.dkr.ecr.us-east-1.amazonaws.com/quadnix/nginx:0.0.1')).toEqual({
        awsAccountId: '123456789012',
        awsRegionId: 'us-east-1',
        imageId: 'quadnix/nginx',
        imageTag: '0.0.1',
      });
    });

    it('should read a repository name of a single segment', () => {
      expect(EcrImageUriUtility.parse('123456789012.dkr.ecr.eu-west-1.amazonaws.com/nginx:latest')).toEqual({
        awsAccountId: '123456789012',
        awsRegionId: 'eu-west-1',
        imageId: 'nginx',
        imageTag: 'latest',
      });
    });
  });
});
