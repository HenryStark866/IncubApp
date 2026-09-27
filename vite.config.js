import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  build: {
    // Paneles se code-split; el entry queda pequeño. Límite más realista.
    chunkSizeWarningLimit: 600,
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Datos fijos de Mantum (historial de OT ~6,5 MB, planes AM): casi nunca
          // cambian. En su propio archivo el navegador los conserva entre versiones
          // y no los vuelve a bajar cada vez que se publica un cambio de código.
          if (/src[\\/]data[\\/](mantumHistoricalOTs|mantumMaintenancePlans|annualMaintenancePlanData)\.json$/.test(id)) {
            return 'mantum-datos'
          }
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('leaflet')) return 'leaflet'
            if (id.includes('@supabase')) return 'supabase'
            // React core separado para cache estable del shell
            if (
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react/') ||
              id.includes('node_modules/scheduler')
            ) {
              return 'react-vendor'
            }
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    strictPort: false,
    hmr: true,
  },
  optimizeDeps: {
    include: ['@supabase/supabase-js', 'react', 'react-dom'],
  },
})
