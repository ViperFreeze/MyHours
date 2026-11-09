export { initializeApp } from "firebase/app";
export { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, browserLocalPersistence, indexedDBLocalPersistence, initializeAuth, browserPopupRedirectResolver } from "firebase/auth";
export { getFirestore, doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore/lite";
