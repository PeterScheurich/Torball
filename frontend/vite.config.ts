import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // shared wird fuers Backend als CommonJS nach dist/ kompiliert - das kann der Browser nicht
      // laden. Das Frontend bindet deshalb den TypeScript-QUELLTEXT direkt ein; so kann geteilte
      // Logik (shared/src/logik/) einmal geschrieben statt in zwei Kopien gepflegt werden.
      // Typpruefung (tsc) laeuft weiterhin gegen shared/dist - dafuer muss shared vorher gebaut sein.
      '@torball/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // Standard bleibt 5173; nur wenn PORT gesetzt ist (z.B. paralleler Dev-Server), diesen nehmen.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
