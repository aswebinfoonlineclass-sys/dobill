import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.APP_URL': JSON.stringify(env.APP_URL || ""),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'lightningcss/node/index.mjs': 'lightningcss/node/index.js',
      },
    },
    server: {
      cors: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    },
  };
});
