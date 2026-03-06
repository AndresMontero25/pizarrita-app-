import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDZBnOblThQYdZHaeUDz7EHWj3kbwOa2iA",
  authDomain: "pizarrita-app.firebaseapp.com",
  projectId: "pizarrita-app",
  storageBucket: "pizarrita-app.firebasestorage.app",
  messagingSenderId: "685908220406",
  appId: "1:685908220406:web:dc74d0f891844385c1cfd7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
