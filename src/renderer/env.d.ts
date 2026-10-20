/// <reference types="vite/client" />
import type { BabelApi } from '../preload'

declare global {
  interface Window {
    /** preload의 contextBridge가 노출한 유일한 통신 창구. */
    babel: BabelApi
  }
}
