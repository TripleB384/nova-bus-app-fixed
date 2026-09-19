import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const welcomeMsg = document.getElementById("welcome-msg");
const logoutBtn = document.getElementById("logout-btn");
const errorMsg = document.getElementById("error-msg");
const trackingStatus = document.getElementById("tracking-status");
const trackingToggle = document.getElementById("tracking-toggle");
const tripSummary = document.getElementById("trip-summary");
const delayStatus = document.getElementById("delay-status");
const delayMinutesInput = document.getElementById("delay-minutes");
const delayNoteInput = document.getElementById("delay-note");
const delaySubmit = document.getElementById("delay-submit");
const delayError = document.getElementById("delay-error");
const busMapEl = document.getElementById("bus-map");
const finishBtn = document.getElementById("finish-route");

const BROWARD_CENTER = [26.1901, -80.3659];
const BROWARD_ZOOM = 11;
const BROWARD_MIN_ZOOM = 9;

let currentUser = null;
let watchId = null;
let sharingSince = null;
let delayActive = false;
let map = null;
let school = null;
const busMarkers = new Map();

async function loadSchoolSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "school"));
    if (snap.exists()) school = snap.data();
  } catch (err) {
    // Finish Route falls back to the driver's last GPS fix if this fails.
  }
}

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
    await loadSchoolSettings();

    const busSnap = await getDoc(doc(db, "buses", user.uid));
    if (busSnap.exists() && busSnap.data().delayed) {
      const data = busSnap.data();
      delayActive = true;
      delaySubmit.textContent = "Clear Delay";
      delayStatus.textContent = `Reported ${data.delayMinutes} min delay${data.delayNote ? " — " + data.delayNote : ""}.`;
    }
  } catch (err) {
    welcomeMsg.textContent = "Error loading profile: " + err.message;
  }
});

function updateTripSummary() {
  if (!sharingSince) {
    tripSummary.textContent = "Not sharing your location right now.";
    return;
  }
  const minutes = Math.max(0, Math.round((Date.now() - sharingSince) / 60000));
  tripSummary.textContent = `Sharing for ${minutes} minute${minutes === 1 ? "" : "s"}. Last update just now.`;
}

function showLiveMap() {
  if (map) return;

  busMapEl.style.display = "block";
  map = L.map("bus-map", { minZoom: BROWARD_MIN_ZOOM }).setView(BROWARD_CENTER, BROWARD_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  const busesQuery = query(collection(db, "buses"), where("active", "==", true));

  onSnapshot(busesQuery, (snapshot) => {
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

      const isYou = busId === currentUser.uid;
      const label = isYou ? "You" : data.driverEmail || "Bus";

      if (busMarkers.has(busId)) {
        busMarkers.get(busId).setLatLng([data.lat, data.lng]);
      } else {
        const marker = L.marker([data.lat, data.lng]).addTo(map);
        marker.bindPopup(label);
        busMarkers.set(busId, marker);

        if (isYou) {
          map.setView([data.lat, data.lng], 15);
          marker.openPopup();
        }
      }
    });
  });
}

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
            arrived: false,
            lat: latitude,
            lng: longitude,
            heading: heading ?? null,
            speed: speed ?? null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        updateTripSummary();
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

  sharingSince = Date.now();
  updateTripSummary();
  trackingStatus.textContent = "Sharing your live location...";
  trackingToggle.textContent = "Stop Sharing Location";
  finishBtn.style.display = "inline-block";
  showLiveMap();
}

async function stopSharing() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  sharingSince = null;
  updateTripSummary();
  trackingStatus.textContent = "Begin sharing your live location while you drive.";
  trackingToggle.textContent = "Start Sharing Location";
  finishBtn.style.display = "none";

  if (currentUser) {
    try {
      await setDoc(doc(db, "buses", currentUser.uid), { active: false }, { merge: true });
    } catch (err) {
      errorMsg.textContent = "Error updating status: " + err.message;
    }
  }
}

async function finishRoute() {
  if (!currentUser) return;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  sharingSince = null;
  updateTripSummary();
  trackingStatus.textContent = "Route finished — arrived at school.";
  trackingToggle.textContent = "Start Sharing Location";
  finishBtn.style.display = "none";

  const updates = {
    active: false,
    arrived: true,
    arrivedAt: serverTimestamp(),
    delayed: false,
    delayMinutes: null,
    delayNote: null,
  };

  if (school && typeof school.lat === "number" && typeof school.lng === "number") {
    updates.lat = school.lat;
    updates.lng = school.lng;
  }

  try {
    await setDoc(doc(db, "buses", currentUser.uid), updates, { merge: true });
    delayActive = false;
    delaySubmit.textContent = "Report Delay";
    delayStatus.textContent = "No delay reported.";
  } catch (err) {
    errorMsg.textContent = "Error finishing route: " + err.message;
  }
}

trackingToggle.addEventListener("click", () => {
  if (watchId === null) {
    startSharing();
  } else {
    stopSharing();
  }
});

finishBtn.addEventListener("click", finishRoute);

delaySubmit.addEventListener("click", async () => {
  if (!currentUser) return;
  delayError.textContent = "";

  try {
    if (!delayActive) {
      const minutes = parseInt(delayMinutesInput.value, 10);
      if (!minutes || minutes <= 0) {
        delayError.textContent = "Enter how many minutes late.";
        return;
      }

      await setDoc(
        doc(db, "buses", currentUser.uid),
        {
          driverEmail: currentUser.email,
          delayed: true,
          delayMinutes: minutes,
          delayNote: delayNoteInput.value || null,
          delayUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      delayActive = true;
      delaySubmit.textContent = "Clear Delay";
      delayStatus.textContent = `Reported ${minutes} min delay${delayNoteInput.value ? " — " + delayNoteInput.value : ""}.`;
    } else {
      await setDoc(
        doc(db, "buses", currentUser.uid),
        {
          delayed: false,
          delayMinutes: null,
          delayNote: null,
          delayUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      delayActive = false;
      delaySubmit.textContent = "Report Delay";
      delayStatus.textContent = "No delay reported.";
      delayMinutesInput.value = "";
      delayNoteInput.value = "";
    }
  } catch (err) {
    delayError.textContent = err.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  await stopSharing();
  await signOut(auth);
  window.location.href = "index.html";
});
