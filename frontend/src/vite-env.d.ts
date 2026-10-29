/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin. Empty string = same origin (proxied `/api`). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
