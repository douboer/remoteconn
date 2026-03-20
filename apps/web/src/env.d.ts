/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_GATEWAY_URL?: string;
	readonly VITE_GATEWAY_TOKEN?: string;
	readonly VITE_ENABLE_PLUGIN_RUNTIME?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
