import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolveStudioReleaseIdentity } from './scripts/studio-release-identity.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const release = resolveStudioReleaseIdentity({ cwd: root });
export default defineConfig({
  publicDir: 'client-public',
  plugins: [react(), {
    name: 'lightweaver-client-release',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'client-release.json', source: JSON.stringify(release, null, 2) + '\n' });
    },
  }],
  define: {
    __LIGHTWEAVER_CLIENT_RELEASE__: JSON.stringify(release),
    __LIGHTWEAVER_STUDIO_RELEASE__: JSON.stringify(release),
    __LIGHTWEAVER_BUILD_TARGET__: JSON.stringify('public-https'),
  },
  build: {
    outDir: '.pages/lightweaver-client',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./client.html', import.meta.url)) },
  },
});
