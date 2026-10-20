import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@core': resolve(__dirname, 'src/core'),
  '@renderer': resolve(__dirname, 'src/renderer')
}

/**
 * CSP는 빌드 산출물에만 넣는다.
 * 개발 모드에서는 React Refresh가 인라인 스크립트를 주입해 메타 태그 CSP와 충돌한다.
 * style-src의 unsafe-inline은 React의 style 속성 때문에 필요하다.
 */
function cspPlugin(): Plugin {
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'"
  ].join('; ')

  return {
    name: 'babel-agent:csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `  <meta http-equiv="Content-Security-Policy" content="${csp}" />\n  </head>`
      )
    }
  }
}

export default defineConfig({
  main: {
    // Agent SDK는 CLI를 띄우는 ESM 전용 패키지라 번들하지 않고 외부 모듈로 둔다
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    }
  },
  preload: {
    // sandbox: true 프리로드는 CJS여야 한다
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), cspPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    }
  }
})
