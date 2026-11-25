import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** node_modules packages matched by name (works with npm workspaces hoisting and on Windows paths). */
const packages = (...names: string[]) => new RegExp(`[\\\\/]node_modules[\\\\/](?:${names.join('|')})[\\\\/]`);

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' } },
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks: framework code changes far less often than the app, so it stays cached
        // across deploys. Page chunks come from the lazy routes in src/app/routes.ts.
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: packages('react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler', 'cookie', 'set-cookie-parser'), priority: 20 },
            { name: 'vendor-motion', test: packages('framer-motion', 'motion-dom', 'motion-utils'), priority: 10 },
            // One small icon chunk instead of a sub-kilobyte chunk per icon shared between lazy pages.
            { name: 'vendor-icons', test: packages('lucide-react'), priority: 5 },
          ],
        },
      },
    },
  },
});
