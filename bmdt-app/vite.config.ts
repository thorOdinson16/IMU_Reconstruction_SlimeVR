import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const protocolSource = path.resolve(appRoot, '../solarxr-protocol/protocol/typescript/src');

export default defineConfig({
  publicDir: path.resolve(appRoot, '../gui-mocap/public'),
  resolve: {
    alias: {
      'solarxr-protocol': path.join(protocolSource, 'all_generated.ts'),
      flatbuffers: path.resolve(appRoot, 'node_modules/flatbuffers/mjs/index.js'),
      three: path.resolve(appRoot, 'node_modules/three'),
    },
  },
  build: {
    target: 'es2022',
  },
});
