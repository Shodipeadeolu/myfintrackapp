// ============================================================
//  PASTE YOUR FIREBASE CONFIG HERE
//  Firebase Console → Project Settings → Your Apps → SDK setup
// ============================================================
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyB303nIXc36-1Sj7ESKXbDejQWkH_b5Z_Y",
  authDomain: "myfintrack-44d97.firebaseapp.com",
  projectId: "myfintrack-44d97",
  storageBucket: "myfintrack-44d97.firebasestorage.app",
  messagingSenderId: "558838708743",
  appId: "1:558838708743:web:74b168df68580f649748a2",
  measurementId: "G-TN8XR2YZ79"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
