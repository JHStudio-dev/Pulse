import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build step.
  transpilePackages: ['@pulse/core', '@pulse/database', '@pulse/types', '@pulse/validation'],
  agentRules: false,
};

export default config;
