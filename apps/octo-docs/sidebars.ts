import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      id: 'introduction',
      label: 'Introduction',
      type: 'doc',
    },
    {
      id: 'why-octo',
      label: 'Why Octo',
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
          id: 'getting-started/static-website',
          label: 'Static Website',
          type: 'doc',
        },
        {
          id: 'getting-started/shop-stack',
          label: 'Shop Stack',
          type: 'doc',
        },
        {
          id: 'getting-started/the-lifecycle',
          label: 'The Lifecycle',
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
        description: 'Install Octo, deploy something real, and learn the run cycle.',
        type: 'generated-index',
      },
      type: 'category',
    },
    {
      items: [
        {
          id: 'fundamentals/how-octo-works',
          label: 'How Octo Works',
          type: 'doc',
        },
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
          id: 'fundamentals/state',
          label: 'State',
          type: 'doc',
        },
        {
          id: 'fundamentals/shop-stack-explained',
          label: 'Shop Stack Explained',
          type: 'doc',
        },
      ],
      label: 'Fundamentals',
      link: {
        description: 'The ideas the rest of Octo is built from.',
        type: 'generated-index',
      },
      type: 'category',
    },
    {
      items: [
        {
          id: 'using-octo/the-definition-file',
          label: 'The Definition File',
          type: 'doc',
        },
        {
          id: 'using-octo/composing-modules',
          label: 'Composing Modules',
          type: 'doc',
        },
        {
          id: 'using-octo/reading-a-validate-report',
          label: 'Reading a Validate Report',
          type: 'doc',
        },
        {
          id: 'using-octo/tagging-resources',
          label: 'Tagging Resources',
          type: 'doc',
        },
        {
          id: 'using-octo/destroying-infrastructure',
          label: 'Destroying Infrastructure',
          type: 'doc',
        },
        {
          id: 'using-octo/recovering-a-failed-run',
          label: 'Recovering a Failed Run',
          type: 'doc',
        },
        {
          id: 'using-octo/troubleshooting',
          label: 'Troubleshooting',
          type: 'doc',
        },
      ],
      label: 'Using Octo',
      link: {
        description: 'Day-to-day operation of an Octo app.',
        type: 'generated-index',
      },
      type: 'category',
    },
    {
      items: [
        {
          id: 'building-modules/anatomy-of-a-module',
          label: 'Anatomy of a Module',
          type: 'doc',
        },
        {
          id: 'building-modules/create-a-module',
          label: 'Create a Module',
          type: 'doc',
        },
        {
          id: 'building-modules/create-a-model',
          label: 'Create a Model',
          type: 'doc',
        },
        {
          id: 'building-modules/create-a-terraform-resource',
          label: 'Create a Terraform Resource',
          type: 'doc',
        },
        {
          id: 'building-modules/create-an-external-resource',
          label: 'Create an External Resource',
          type: 'doc',
        },
        {
          id: 'building-modules/create-an-anchor',
          label: 'Create an Anchor',
          type: 'doc',
        },
        {
          id: 'building-modules/create-an-overlay',
          label: 'Create an Overlay',
          type: 'doc',
        },
        {
          id: 'building-modules/testing-a-module',
          label: 'Testing a Module',
          type: 'doc',
        },
        {
          id: 'building-modules/publishing-a-library',
          label: 'Publishing a Library',
          type: 'doc',
        },
      ],
      label: 'Building Modules',
      link: {
        description: 'Write the building blocks your team composes from.',
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
        {
          id: 'techniques/events-and-listeners',
          label: 'Events and Listeners',
          type: 'doc',
        },
        {
          id: 'techniques/hooks',
          label: 'Hooks',
          type: 'doc',
        },
        {
          id: 'techniques/state-providers',
          label: 'State Providers',
          type: 'doc',
        },
        {
          id: 'techniques/github-actions-pipeline',
          label: 'GitHub Actions Pipeline',
          type: 'doc',
        },
      ],
      label: 'Techniques',
      link: {
        description: 'Extension points, and the seams you hook into.',
        type: 'generated-index',
      },
      type: 'category',
    },
    {
      items: [
        {
          id: 'reference/cli',
          label: 'CLI',
          type: 'doc',
        },
        {
          id: 'reference/aws-module-catalog',
          label: 'AWS Module Catalog',
          type: 'doc',
        },
        {
          id: 'reference/templates',
          label: 'Templates',
          type: 'doc',
        },
        {
          id: 'reference/package-versions',
          label: 'Package Versions',
          type: 'doc',
        },
      ],
      label: 'Reference',
      link: {
        description:
          'Every command, the AWS module catalog, the templates to start from, and how the ' +
          'package versions are numbered.',
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
