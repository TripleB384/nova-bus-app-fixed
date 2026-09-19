import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const welcomeMsg = document.getElementById("welcome-msg");
const logoutBtn = document.getElementById("logout-btn");
const delayBanner = document.getElementById("delay-banner");
const mapCardHeader = document.querySelector("#map-card .card-header");
const etaList = document.getElementById("eta-list");
const scheduleText = document.getElementById("schedule-text");

const BROWARD_CENTER = [26.1901, -80.3659];
const BROWARD_ZOOM = 11;
const BROWARD_MIN_ZOOM = 9;
const AVERAGE_SPEED_MPH = 20;

const busMarkers = new Map();
let unsubscribeBuses = null;
let map = null;
let school = null;

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loadSchoolSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "school"));
    if (snap.exists()) school = snap.data();
  } catch (err) {
    // Arrival Time / Schedule cards fall back to their "not set" messages.
  }
}

function renderEtaList(busDocs) {
  if (!school || typeof school.lat !== "number" || typeof school.lng !== "number") {
    etaList.innerHTML = "<p>School location hasn't been set yet — ask your admin.</p>";
    return;
  }

  const active = busDocs.filter((d) => typeof d.data().lat === "number" && typeof d.data().lng === "number");

  if (active.length === 0) {
    etaList.innerHTML = "<p>No buses are currently sharing their location.</p>";
    return;
  }

  etaList.innerHTML = "";
  active.forEach((d) => {
    const data = d.data();
    const miles = haversineMiles(data.lat, data.lng, school.lat, school.lng);
    const minutes = Math.round((miles / AVERAGE_SPEED_MPH) * 60);

    const item = document.createElement("p");
    item.textContent = `${data.driverEmail || "Bus"} — ${miles.toFixed(1)} mi from school — ~${minutes} min (estimated)`;
    etaList.appendChild(item);
  });
}

function renderSchedule() {
  if (!school || (!school.startTime && !school.endTime)) {
    scheduleText.textContent = "School hours haven't been set yet.";
    return;
  }
  scheduleText.textContent = `School starts at ${school.startTime || "?"} and ends at ${school.endTime || "?"}.`;
}

function renderDelayBanner(busDocs) {
  const delayed = busDocs.filter((d) => d.data().delayed);

  if (delayed.length === 0) {
    delayBanner.classList.remove("is-visible");
    return;
  }

  const summary = delayed
    .map((d) => {
      const data = d.data();
      return `${data.driverEmail || "A bus"} is running ${data.delayMinutes} min late`;
    })
    .join("; ");

  delayBanner.textContent = "🚨 " + summary;
  delayBanner.classList.add("is-visible");
}

function startLiveMap() {
  map = L.map("bus-map", { minZoom: BROWARD_MIN_ZOOM }).setView(BROWARD_CENTER, BROWARD_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  if (mapCardHeader) {
    mapCardHeader.addEventListener("click", () => {
      setTimeout(() => map.invalidateSize(), 260);
    });
  }

  const busesQuery = query(collection(db, "buses"), where("active", "==", true));

  unsubscribeBuses = onSnapshot(busesQuery, (snapshot) => {
    renderDelayBanner(snapshot.docs);
    renderEtaList(snapshot.docs);

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

// Guard: only signed-in students should see this page
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists() || snap.data().role !== "student") {
      // Not a student — send back to login rather than showing this page
      window.location.href = "index.html";
      return;
    }

    welcomeMsg.textContent = "Signed in as " + user.email;
    await loadSchoolSettings();
    renderSchedule();
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
