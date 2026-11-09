// Fonctions Firebase utilisées par MyHours. Pour régénérer firebase.js : voir README, section 7.
export { initializeApp } from "firebase/app";
export {
  initializeAuth, onAuthStateChanged, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, EmailAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, reauthenticateWithPopup, reauthenticateWithCredential, deleteUser
} from "firebase/auth";
export { getFirestore, doc, getDoc, deleteDoc, runTransaction, serverTimestamp } from "firebase/firestore/lite";
