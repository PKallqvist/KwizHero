import {
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  linkWithCredential,
  signOut,
  signInAnonymously,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
  type Unsubscribe,
} from "firebase/auth";
import { getFirebaseServices } from "./firebase";

export function onAuthStateChanged(callback: (user: User | null) => void): Unsubscribe {
  const { auth } = getFirebaseServices();
  return firebaseOnAuthStateChanged(auth, callback);
}

export function getCurrentUser(): User | null {
  const { auth } = getFirebaseServices();
  return auth.currentUser;
}

export function isCreatorAuthenticated(): boolean {
  const user = getCurrentUser();
  return user !== null && !user.isAnonymous;
}

export async function signInWithGoogle(): Promise<User> {
  const { auth } = getFirebaseServices();
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const { auth } = getFirebaseServices();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { auth } = getFirebaseServices();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function linkAnonymousToGoogle(): Promise<User> {
  const { auth } = getFirebaseServices();
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.isAnonymous) {
    return signInWithGoogle();
  }
  const provider = new GoogleAuthProvider();
  const googleCredential = await signInWithPopup(auth, provider);
  const oauthCredential = GoogleAuthProvider.credentialFromResult(googleCredential);
  if (!oauthCredential) {
    return googleCredential.user;
  }
  try {
    const linked = await linkWithCredential(currentUser, oauthCredential);
    return linked.user;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === "auth/credential-already-in-use") {
      return googleCredential.user;
    }
    throw error;
  }
}

export async function linkAnonymousToEmail(email: string, password: string): Promise<User> {
  const { auth } = getFirebaseServices();
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.isAnonymous) {
    return signInWithEmail(email, password);
  }
  const emailCredential = EmailAuthProvider.credential(email, password);
  try {
    const linked = await linkWithCredential(currentUser, emailCredential);
    return linked.user;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === "auth/credential-already-in-use") {
      return signInWithEmail(email, password);
    }
    throw error;
  }
}

export async function signOutCreator(): Promise<void> {
  const { auth } = getFirebaseServices();
  await signOut(auth);
  await signInAnonymously(auth);
}
