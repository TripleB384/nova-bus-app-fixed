import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const welcomeMsg = document.getElementById("welcome-msg");
const logoutBtn = document.getElementById("logout-btn");

const busMarkers = new Map();
let unsubscribeBuses = null;

function startLiveMap() {
  const map = L.map("bus-map").setView([0, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  const busesQuery = query(collection(db, "buses"), where("active", "==", true));

  unsubscribeBuses = onSnapshot(busesQuery, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const busId = change.doc.id;

      if (change.type === "removed") {
        if (busMarkers.has(busId)) {
          map.removeLayer(busMarkers.get(busId));
          busMarkers.delete(busId);
        }
        return;
      }

      const data = change.doc.data();
      if (typeof data.lat !== "number" || typeof data.lng !== "number") return;

      if (busMarkers.has(busId)) {
        busMarkers.get(busId).setLatLng([data.lat, data.lng]);
      } else {
        const marker = L.marker([data.lat, data.lng]).addTo(map);
        marker.bindPopup(data.driverEmail || "Bus");
        busMarkers.set(busId, marker);
      }
    });
  });
}

function stopLiveMap() {
  if (unsubscribeBuses) {
    unsubscribeBuses();
    unsubscribeBuses = null;
  }
}

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
    startLiveMap();
  } catch (err) {
    welcomeMsg.textContent = "Error loading profile: " + err.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  stopLiveMap();
  await signOut(auth);
  window.location.href = "index.html";
});
