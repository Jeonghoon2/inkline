import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// main/preload 는 node_modules 의존성을 기본으로 외부화한다
export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [react()] }
})
