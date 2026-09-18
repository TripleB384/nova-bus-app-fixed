import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB7NOGyOHTk5u49_33azjId9_GAeYy6Rkw",
  authDomain: "nova-bus-app.firebaseapp.com",
  projectId: "nova-bus-app",
  storageBucket: "nova-bus-app.firebasestorage.app",
  messagingSenderId: "23190693484",
  appId: "1:23190693484:web:6b793df601a7c9b3231a49"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
