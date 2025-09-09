import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      id: 'introduction',
      label: 'Introduction',
      type: 'doc',
    },
    {
      id: 'philosophy',
      label: 'Philosophy',
      type: 'doc',
    },
    {
      items: [
        {
          id: 'getting-started/installation',
          label: 'Installation',
          type: 'doc',
        },
        {
          id: 'getting-started/hello-world',
          label: 'Hello World!',
          type: 'doc',
        },
        {
          id: 'getting-started/project-structure',
          label: 'Project Structure',
          type: 'doc',
        },
      ],
      label: 'Getting Started',
      link: {
        description: 'Installation & Setup.',
        type: 'generated-index',
      },
      type: 'category',
    },
    {
      items: [
        {
          id: 'fundamentals/models',
          label: 'Models',
          type: 'doc',
        },
        {
          id: 'fundamentals/resources',
          label: 'Resources',
          type: 'doc',
        },
        {
          id: 'fundamentals/dependencies',
          label: 'Dependencies',
          type: 'doc',
        },
        {
          id: 'fundamentals/actions',
          label: 'Actions',
          type: 'doc',
        },
        {
          id: 'fundamentals/anchors',
          label: 'Anchors',
          type: 'doc',
        },
        {
          id: 'fundamentals/overlays',
          label: 'Overlays',
          type: 'doc',
        },
        {
          id: 'fundamentals/modules',
          label: 'Modules',
          type: 'doc',
        },
        {
          id: 'fundamentals/hello-world-explained',
          label: 'Hello World! (Explained)',
          type: 'doc',
        },
      ],
      label: 'Fundamentals',
      link: {
        description: 'Basic concepts.',
        type: 'generated-index',
      },
      type: 'category',
    },
    {
      items: [
        {
          id: 'devops/create-cdk',
          label: 'Create a CDK',
          type: 'doc',
        },
        {
          id: 'devops/create-sdk-client-factory',
          label: 'Create a SDK Client Factory',
          type: 'doc',
        },
        {
          id: 'devops/create-resource',
          label: 'Create a Resource',
          type: 'doc',
        },
        {
          id: 'devops/create-model',
          label: 'Create a Model',
          type: 'doc',
        },
        {
          id: 'devops/create-overlay',
          label: 'Create an Overlay',
          type: 'doc',
        },
      ],
      label: 'DevOps',
      link: {
        description: 'CDK concepts and code examples.',
        type: 'generated-index',
      },
      type: 'category',
    },
    {
      items: [
        {
          id: 'techniques/schema',
          label: 'Schema',
          type: 'doc',
        },
        {
          id: 'techniques/validation',
          label: 'Validation',
          type: 'doc',
        },
      ],
      label: 'Techniques',
      link: {
        description: 'Techniques and run books.',
        type: 'generated-index',
      },
      type: 'category',
    },
    {
      items: [
        {
          id: 'contributions/nx.json/nx.contribution',
          type: 'doc',
        },
        {
          id: 'contributions/tsconfig.json/tsconfig.contribution',
          type: 'doc',
        },
      ],
      label: 'Contribution Guide',
      link: {
        description: 'Guide to contribute to Octo.',
        type: 'generated-index',
      },
      type: 'category',
    },
  ],
};

export default sidebars;
