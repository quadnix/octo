import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
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
          id: 'fundamentals/the-big-picture-part-one',
          label: 'The Big Picture, Part I',
          type: 'doc',
        },
        {
          id: 'fundamentals/the-big-picture-part-two',
          label: 'The Big Picture, Part II',
          type: 'doc',
        },
        {
          id: 'fundamentals/aws-models',
          label: 'AWS Models',
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
          id: 'techniques/testing',
          label: 'Testing',
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
