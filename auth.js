import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const form = document.getElementById("login-form");
const errorMsg = document.getElementById("error-msg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.textContent = "";

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged below handles the redirect once sign-in succeeds
  } catch (err) {
    errorMsg.textContent = "Login failed: " + err.message;
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
    else errorMsg.textContent = "Unknown role assigned to this account.";

  } catch (err) {
    errorMsg.textContent = "Error loading profile: " + err.message;
  }
});
