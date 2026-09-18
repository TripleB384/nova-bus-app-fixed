import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const welcomeMsg = document.getElementById("welcome-msg");
const logoutBtn = document.getElementById("logout-btn");
const errorMsg = document.getElementById("error-msg");
const trackingStatus = document.getElementById("tracking-status");
const trackingToggle = document.getElementById("tracking-toggle");

let currentUser = null;
let watchId = null;

// Guard: only signed-in drivers should see this page
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists() || snap.data().role !== "driver") {
      // Not a driver — send back to login rather than showing this page
      window.location.href = "index.html";
      return;
    }

    currentUser = user;
    welcomeMsg.textContent = "Signed in as " + user.email;
  } catch (err) {
    welcomeMsg.textContent = "Error loading profile: " + err.message;
  }
});

function startSharing() {
  if (!navigator.geolocation) {
    errorMsg.textContent = "Geolocation isn't supported on this device.";
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude, heading, speed } = position.coords;
      try {
        await setDoc(
          doc(db, "buses", currentUser.uid),
          {
            driverEmail: currentUser.email,
            active: true,
            lat: latitude,
            lng: longitude,
            heading: heading ?? null,
            speed: speed ?? null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        errorMsg.textContent = "Error sharing location: " + err.message;
      }
    },
    (err) => {
      errorMsg.textContent = "Location error: " + err.message;
      stopSharing();
    },
    { enableHighAccuracy: true }
  );

  trackingStatus.textContent = "Sharing your live location...";
  trackingToggle.textContent = "Stop Sharing Location";
}

async function stopSharing() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  trackingStatus.textContent = "Begin sharing your live location for today's route.";
  trackingToggle.textContent = "Start Sharing Location";

  if (currentUser) {
    try {
      await setDoc(doc(db, "buses", currentUser.uid), { active: false }, { merge: true });
    } catch (err) {
      errorMsg.textContent = "Error updating status: " + err.message;
    }
  }
}

trackingToggle.addEventListener("click", () => {
  if (watchId === null) {
    startSharing();
  } else {
    stopSharing();
  }
});

logoutBtn.addEventListener("click", async () => {
  await stopSharing();
  await signOut(auth);
  window.location.href = "index.html";
});
