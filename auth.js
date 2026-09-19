import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const form = document.getElementById("login-form");
const errorMsg = document.getElementById("error-msg");
const submitBtn = document.getElementById("submit-btn");
const toggleMode = document.getElementById("toggle-mode");

let mode = "login"; // "login" | "signup"

toggleMode.addEventListener("click", (e) => {
  e.preventDefault();
  mode = mode === "login" ? "signup" : "login";
  errorMsg.textContent = "";

  if (mode === "signup") {
    submitBtn.textContent = "Create Account";
    toggleMode.textContent = "Already have an account? Log in";
  } else {
    submitBtn.textContent = "Log In";
    toggleMode.textContent = "New here? Create an account";
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.textContent = "";

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    if (mode === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // New accounts get no role — an admin assigns one via Manage Users.
      // Letting people pick their own role here would let anyone sign up as "admin".
      await setDoc(doc(db, "users", cred.user.uid), {
        email,
        role: null,
        createdAt: serverTimestamp(),
      });
      // onAuthStateChanged below handles what happens next
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged below handles the redirect once sign-in succeeds
    }
  } catch (err) {
    errorMsg.textContent = (mode === "signup" ? "Sign up failed: " : "Login failed: ") + err.message;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return; // not logged in yet, stay on login page

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) {
      errorMsg.textContent = "No profile found for this account. Contact an admin.";
      return;
    }

    const role = snap.data().role;

    if (role === "driver") window.location.href = "driver.html";
    else if (role === "admin") window.location.href = "admin.html";
    else if (role === "teacher") window.location.href = "teacher.html";
    else if (role === "student") window.location.href = "student.html";
    else errorMsg.textContent = "Your account is pending admin approval. Contact an admin to get access.";

  } catch (err) {
    errorMsg.textContent = "Error loading profile: " + err.message;
  }
});
