import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

// "demo-" prefixed project IDs are recognized by the Firebase SDKs/CLI as local-only —
// they never resolve to a real project, so an e2e test that accidentally touched
// Firestore/Functions (neither of which is emulated here) fails loudly instead of
// silently writing to a real database.
const config = useEmulators
  ? {
      apiKey: "demo-e2e-api-key",
      authDomain: "localhost",
      projectId: "demo-kwizhero-e2e",
      appId: "demo-e2e-app-id",
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

const missingKeys = useEmulators
  ? []
  : Object.entries(config)
      .filter(([, value]) => typeof value !== "string" || value.trim().length === 0)
      .map(([key]) => key);

export const firebaseConfigError =
  missingKeys.length > 0
    ? `Missing Firebase environment values: ${missingKeys.join(", ")}`
    : null;

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

let services: FirebaseServices | null = null;

export function getFirebaseServices(): FirebaseServices {
  if (firebaseConfigError) {
    throw new Error(firebaseConfigError);
  }

  if (!services) {
    const app = initializeApp(config);
    const auth = getAuth(app);
    if (useEmulators) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    }
    services = {
      app,
      auth,
      db: getFirestore(app),
      functions: getFunctions(app),
    };
  }

  return services;
}
