import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const welcomeMsg = document.getElementById("welcome-msg");
const logoutBtn = document.getElementById("logout-btn");
const activeBusesList = document.getElementById("active-buses-list");

let unsubscribeBuses = null;

function startActiveBusesList() {
  const busesQuery = query(collection(db, "buses"), where("active", "==", true));

  unsubscribeBuses = onSnapshot(busesQuery, (snapshot) => {
    if (snapshot.empty) {
      activeBusesList.innerHTML = "<p>No buses are currently sharing their location.</p>";
      return;
    }

    activeBusesList.innerHTML = "";
    snapshot.forEach((busDoc) => {
      const data = busDoc.data();
      const updated = data.updatedAt?.toDate ? data.updatedAt.toDate().toLocaleTimeString() : "unknown";
      const delay = data.delayed ? ` — delayed ${data.delayMinutes ?? "?"} min` : "";

      const item = document.createElement("p");
      item.textContent = `${data.driverEmail || "Unknown driver"} — updated ${updated}${delay}`;
      activeBusesList.appendChild(item);
    });
  });
}

function stopActiveBusesList() {
  if (unsubscribeBuses) {
    unsubscribeBuses();
    unsubscribeBuses = null;
  }
}

// Guard: only signed-in admins should see this page
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists() || snap.data().role !== "admin") {
      // Not an admin — send back to login rather than showing this page
      window.location.href = "index.html";
      return;
    }

    welcomeMsg.textContent = "Signed in as " + user.email;
    startActiveBusesList();
  } catch (err) {
    welcomeMsg.textContent = "Error loading profile: " + err.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  stopActiveBusesList();
  await signOut(auth);
  window.location.href = "index.html";
});
