/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FOUNDATION_URL?: string;
  readonly VITE_GRN_URL?: string;
  /** GRN API base URL, used by the API access request queue. */
  readonly VITE_GRN_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
