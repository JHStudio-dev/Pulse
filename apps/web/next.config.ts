import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build step.
  transpilePackages: ['@pulse/core', '@pulse/database', '@pulse/types', '@pulse/validation'],
  // `next dev` otherwise writes AGENTS.md and CLAUDE.md into the app. The
  // repository keeps no AI tooling files, so the generation is turned off.
  agentRules: false,
};

export default config;
