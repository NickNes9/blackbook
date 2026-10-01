export const NODE_VERSION = '24.21.0';
// Pin official Node.js release archives and their published SHA-256 checksums.
export const RUNTIME_SPECS = [
  { platform: 'win', target: 'win-x64', extension: 'zip', sha256: '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541' },
  { platform: 'mac', target: 'darwin-x64', extension: 'tar.xz', sha256: '0ae5a24c24bb7d015cd816c5036b3f90f2945aa872fcf54e58da054753b3a299' },
  { platform: 'mac', target: 'darwin-arm64', extension: 'tar.xz', sha256: '6239d4cf92d864487ec8cd3615038f7b67e7f58b77b21cd2f09ea9fbd68065fe' },
  { platform: 'linux', target: 'linux-x64', extension: 'tar.xz', sha256: 'fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6' }
];

export function runtimeFilename(target) {
  return `node-v${NODE_VERSION}-${target}${target.startsWith('win-') ? '.exe' : ''}`;
}
