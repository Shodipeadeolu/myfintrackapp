import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this as a project site under /myfintrackapp/;
  // Firebase Hosting deploys override this to '/' via VITE_BASE.
  base: process.env.VITE_BASE || '/myfintrackapp/',
})
