import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// Same-origin path the dev server uses to proxy Supabase. Keeping auth/data
// requests first-party means ad-blockers / privacy extensions can never block
// them (the cause of "TypeError: Failed to fetch" on login for some users).
const SUPABASE_PROXY_PATH = '/supabase-api'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://ynqncdczpumsenjhcmxk.supabase.co'

  return {
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      [SUPABASE_PROXY_PATH]: {
        target: supabaseUrl,
        changeOrigin: true,
        secure: true,
        ws: true,
        rewrite: (p) => p.replace(new RegExp(`^${SUPABASE_PROXY_PATH}`), ''),
      },
    },
  },
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
