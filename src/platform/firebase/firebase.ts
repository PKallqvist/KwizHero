import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingKeys = Object.entries(config)
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
    services = {
      app,
      auth: getAuth(app),
      db: getFirestore(app),
      functions: getFunctions(app),
    };
  }

  return services;
}
