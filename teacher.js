import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const welcomeMsg = document.getElementById("welcome-msg");
const logoutBtn = document.getElementById("logout-btn");

// Guard: only signed-in teachers should see this page
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists() || snap.data().role !== "teacher") {
      // Not a teacher — send back to login rather than showing this page
      window.location.href = "index.html";
      return;
    }

    welcomeMsg.textContent = "Signed in as " + user.email;
  } catch (err) {
    welcomeMsg.textContent = "Error loading profile: " + err.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
