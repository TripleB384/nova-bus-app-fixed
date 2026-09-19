import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const welcomeMsg = document.getElementById("welcome-msg");
const logoutBtn = document.getElementById("logout-btn");
const activeBusesList = document.getElementById("active-buses-list");
const lateList = document.getElementById("late-list");
const usersList = document.getElementById("users-list");
const usersError = document.getElementById("users-error");
const schoolLat = document.getElementById("school-lat");
const schoolLng = document.getElementById("school-lng");
const schoolStart = document.getElementById("school-start");
const schoolEnd = document.getElementById("school-end");
const schoolSave = document.getElementById("school-save");
const schoolError = document.getElementById("school-error");

let unsubscribeBuses = null;
let unsubscribeUsers = null;

function renderLateList(busDocs) {
  const delayed = busDocs.filter((d) => d.data().delayed);

  if (delayed.length === 0) {
    lateList.innerHTML = "<p>No buses have reported running late.</p>";
    return;
  }

  lateList.innerHTML = "";
  delayed.forEach((d) => {
    const data = d.data();
    const item = document.createElement("p");
    item.textContent = `${data.driverEmail || "Bus"} — ${data.delayMinutes} min late${data.delayNote ? " — " + data.delayNote : ""}`;
    lateList.appendChild(item);
  });
}

function startActiveBusesList() {
  const busesQuery = query(collection(db, "buses"), where("active", "==", true));

  unsubscribeBuses = onSnapshot(busesQuery, (snapshot) => {
    renderLateList(snapshot.docs);

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

async function loadSchoolSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "school"));
    if (snap.exists()) {
      const data = snap.data();
      schoolLat.value = data.lat ?? "";
      schoolLng.value = data.lng ?? "";
      schoolStart.value = data.startTime ?? "";
      schoolEnd.value = data.endTime ?? "";
    }
  } catch (err) {
    schoolError.textContent = err.message;
  }
}

schoolSave.addEventListener("click", async () => {
  schoolError.textContent = "";
  const lat = parseFloat(schoolLat.value);
  const lng = parseFloat(schoolLng.value);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    schoolError.textContent = "Enter valid latitude and longitude.";
    return;
  }

  try {
    await setDoc(doc(db, "settings", "school"), {
      lat,
      lng,
      startTime: schoolStart.value || null,
      endTime: schoolEnd.value || null,
      updatedAt: serverTimestamp(),
    });
    schoolError.textContent = "Saved.";
  } catch (err) {
    schoolError.textContent = err.message;
  }
});

function startUsersList() {
  unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
    usersList.innerHTML = "";

    if (snapshot.empty) {
      usersList.innerHTML = "<p>No users found.</p>";
      return;
    }

    snapshot.forEach((userDoc) => {
      const data = userDoc.data();
      const label = data.email || userDoc.id.slice(0, 8) + "…";

      const row = document.createElement("div");
      row.className = "user-row";

      const name = document.createElement("span");
      name.textContent = label;

      const select = document.createElement("select");
      ["admin", "driver", "teacher", "student"].forEach((role) => {
        const option = document.createElement("option");
        option.value = role;
        option.textContent = role;
        if (data.role === role) option.selected = true;
        select.appendChild(option);
      });

      select.addEventListener("change", async () => {
        usersError.textContent = "";
        try {
          await updateDoc(doc(db, "users", userDoc.id), { role: select.value });
        } catch (err) {
          usersError.textContent = err.message;
        }
      });

      row.appendChild(name);
      row.appendChild(select);
      usersList.appendChild(row);
    });
  });
}

function stopUsersList() {
  if (unsubscribeUsers) {
    unsubscribeUsers();
    unsubscribeUsers = null;
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
    loadSchoolSettings();
    startUsersList();
  } catch (err) {
    welcomeMsg.textContent = "Error loading profile: " + err.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  stopActiveBusesList();
  stopUsersList();
  await signOut(auth);
  window.location.href = "index.html";
});
