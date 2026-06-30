/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
	readonly VITE_AI_GEN_PASSWORD?: string;
	readonly VITE_USE_FIREBASE_EMULATORS?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
