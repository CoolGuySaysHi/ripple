// app.js — Ripple Relaxation Booking (Firebase + Firestore + Admin + Services Manager + EmailJS)
//
// Needs in index.html:
// <script src="config.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
// <script type="module" src="app.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  updateDoc,
  getDocs,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// -------------------- CONFIG --------------------
const CFG = window.RR_CONFIG || {};
if (!CFG.FIREBASE?.apiKey) {
  alert("Firebase config missing. Paste FIREBASE config into config.js");
}

const OWNER_EMAIL = (CFG.OWNER_EMAIL || CFG.BROTHER_EMAIL || "").trim();
const EMAILCFG = CFG.EMAILJS || { ENABLED: true, PUBLIC_KEY: "", SERVICE_ID: "", TEMPLATE_ID: "" };

const SLOT = CFG.SLOTS || { START_HOUR: 7, END_HOUR: 21, STEP_MIN: 30 };
const DURATION = CFG.DURATION || { MIN_MINUTES: 5, MAX_MINUTES: 120, STEP_MINUTES: 5 };

// Default master list (your requested set). Admin can add more later.
const DEFAULT_SERVICES = Array.isArray(CFG.SERVICES) && CFG.SERVICES.length
  ? CFG.SERVICES
  : ["Eye Pads", "Steam Eye Mask", "Candle", "Sprays", "Foot Mask", "Fan", "Refreshment"];

// -------------------- FIREBASE INIT --------------------
const app = initializeApp(CFG.FIREBASE);
const auth = getAuth(app);
const db = getFirestore(app);

// -------------------- DOM --------------------
const $ = (s) => document.querySelector(s);

// Views
const authView = $("#authView");
const dashView = $("#dashView");
const topActions = $("#topActions");
const whoami = $("#whoami");
const logoutBtn = $("#logoutBtn");

// Auth tabs
const tabs = document.querySelectorAll(".tab");
const loginPanel = $("#loginPanel");
const signupPanel = $("#signupPanel");

// Auth forms
const loginForm = $("#loginForm");
const loginEmail = $("#loginEmail");
const loginPass = $("#loginPass");
const loginError = $("#loginError");

const signupForm = $("#signupForm");
const signupName = $("#signupName");
const signupEmail = $("#signupEmail");
const signupPass = $("#signupPass");
const signupError = $("#signupError");

// Dashboard tabs + views
const dashTabs = $("#dashTabs");
const adminTab = $("#adminTab");
const viewBook = $("#viewBook");
const viewMine = $("#viewMine");
const viewAdmin = $("#viewAdmin");

// Booking form
const bookingForm = $("#bookingForm");
const bookDate = $("#bookDate");
const bookTime = $("#bookTime");
const bookDuration = $("#bookDuration");
const bookNotes = $("#bookNotes");
const bookError = $("#bookError");
const bookSuccess = $("#bookSuccess");
const slotHint = $("#slotHint");

// Services multi-select (tickbox dropdown)
const servicesWrap = $("#servicesWrap");
const servicesBtn = $("#servicesBtn");
const servicesMenu = $("#servicesMenu");
const servicesHidden = $("#servicesHidden");

// My bookings
const myBookingsList = $("#myBookingsList");

// Side stats
const todayLine = $("#todayLine");
const statActive = $("#statActive");
const statBlocked = $("#statBlocked");

// Admin list/filter/export
const adminSearch = $("#adminSearch");
const adminStatus = $("#adminStatus");
const adminDate = $("#adminDate");
const adminClearFilters = $("#adminClearFilters");
const adminExportCsv = $("#adminExportCsv");
const adminBookingsList = $("#adminBookingsList");

// Admin block/unblock
const blockDate = $("#blockDate");
const blockTime = $("#blockTime");
const blockSlotBtn = $("#blockSlotBtn");
const unblockSlotBtn = $("#unblockSlotBtn");
const blockHint = $("#blockHint");

// Admin services manager
const adminServicesList = $("#adminServicesList");
const saveServicesBtn = $("#saveServicesBtn");
const servicesSaveHint = $("#servicesSaveHint");
const newServiceInput = $("#newServiceInput");
const addServiceBtn = $("#addServiceBtn");
const addServiceHint = $("#addServiceHint");

// Footer year (optional)
const yearEl = $("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// -------------------- STATE --------------------
let cachedIsAdmin = false;

let unsubMyBookings = null;
let unsubAllBookings = null;
let unsubServicesSettings = null;

// Booking form selections
const selectedServices = new Set();

// Firestore-backed services
let allServices = new Set(DEFAULT_SERVICES);
let enabledServices = new Set(DEFAULT_SERVICES);
const settingsServicesRef = doc(db, "settings", "services");

// -------------------- HELPERS --------------------
function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toDateInputValue(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInput(val) {
  const [y, m, d] = val.split("-").map(Number);
  return new Date(y, (m - 1), d, 0, 0, 0, 0);
}

function slotId(dateStr, timeStr) {
  return `${dateStr}__${timeStr}`;
}

function buildTimes() {
  const times = [];
  for (let h = SLOT.START_HOUR; h <= SLOT.END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT.STEP_MIN) {
      if (h === SLOT.END_HOUR && m > 0) continue;
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return times;
}
const TIMES = buildTimes();

function setTodayLine() {
  if (!todayLine) return;
  const d = new Date();
  todayLine.textContent = d.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function setDashView(which) {
  if (!dashTabs) return;

  for (const b of dashTabs.querySelectorAll(".seg")) b.classList.remove("active");
  dashTabs.querySelector(`.seg[data-view="${which}"]`)?.classList.add("active");

  [viewBook, viewMine, viewAdmin].forEach(v => v?.classList.remove("show"));
  if (which === "mine") viewMine?.classList.add("show");
  else if (which === "admin") viewAdmin?.classList.add("show");
  else viewBook?.classList.add("show");
}

// -------------------- AUTH TAB SWITCH --------------------
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    loginError.textContent = "";
    signupError.textContent = "";

    const tab = btn.dataset.tab;
    if (tab === "login") {
      loginPanel.classList.add("show");
      signupPanel.classList.remove("show");
    } else {
      signupPanel.classList.add("show");
      loginPanel.classList.remove("show");
    }
  });
});

// -------------------- ADMIN CHECK (Firestore: admins/{email}) --------------------
async function checkAdmin(user) {
  cachedIsAdmin = false;
  if (!user?.email) return false;

  const email = user.email.toLowerCase().trim();
  const adminRef = doc(db, "admins", email);
  const snap = await getDoc(adminRef);

  cachedIsAdmin = snap.exists();
  return cachedIsAdmin;
}

// -------------------- EMAILJS (optional) --------------------
async function trySendEmail(payload) {
  if (!EMAILCFG?.ENABLED) return { ok: false, reason: "disabled" };
  if (!OWNER_EMAIL) return { ok: false, reason: "owner email missing in config.js" };

  if (!EMAILCFG.PUBLIC_KEY || !EMAILCFG.SERVICE_ID || !EMAILCFG.TEMPLATE_ID) {
    return { ok: false, reason: "EmailJS not configured (config.js)" };
  }
  if (!window.emailjs?.init) return { ok: false, reason: "EmailJS library missing" };

  try {
    emailjs.init(EMAILCFG.PUBLIC_KEY);
    const res = await emailjs.send(EMAILCFG.SERVICE_ID, EMAILCFG.TEMPLATE_ID, payload);
    return { ok: true, reason: `sent (status ${res.status})` };
  } catch (e) {
    const msg =
      (e && typeof e === "object" && ("text" in e) && e.text) ? e.text :
      (e && typeof e === "object" && ("message" in e) && e.message) ? e.message :
      String(e);
    console.error("EmailJS failed:", e);
    return { ok: false, reason: msg };
  }
}

// -------------------- DURATION DROPDOWN (5-min steps) --------------------
function populateDurationDropdown() {
  if (!bookDuration) return;
  bookDuration.innerHTML = "";

  const min = Math.max(5, Number(DURATION.MIN_MINUTES || 5));
  const max = Math.max(min, Number(DURATION.MAX_MINUTES || 120));
  const step = Math.max(5, Number(DURATION.STEP_MINUTES || 5));

  for (let mins = min; mins <= max; mins += step) {
    const opt = document.createElement("option");
    opt.value = String(mins);
    opt.textContent = `${mins} minutes`;
    bookDuration.appendChild(opt);
  }

  const preferred = [...bookDuration.options].find(o => o.value === "30");
  if (preferred) bookDuration.value = "30";
}

// -------------------- SERVICES MULTI-SELECT --------------------
function updateServicesButton() {
  const arr = [...selectedServices];
  if (!servicesBtn) return;

  if (!arr.length) {
    servicesBtn.textContent = "Select services…";
    if (servicesHidden) servicesHidden.value = "";
    return;
  }
  const label = arr.length <= 2 ? arr.join(", ") : `${arr.length} selected`;
  servicesBtn.textContent = label;
  if (servicesHidden) servicesHidden.value = "ok";
}

function renderServicesMenu() {
  if (!servicesMenu) return;
  servicesMenu.innerHTML = "";

  const list = [...enabledServices].sort((a, b) => a.localeCompare(b));

  for (const name of list) {
    const id = `svc_${name.replaceAll(" ", "_").replaceAll("&", "and")}`;

    const row = document.createElement("label");
    row.className = "multiItem";
    row.htmlFor = id;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = selectedServices.has(name);

    const text = document.createElement("div");
    text.textContent = name;

    cb.addEventListener("change", () => {
      if (cb.checked) selectedServices.add(name);
      else selectedServices.delete(name);
      updateServicesButton();
    });

    row.appendChild(cb);
    row.appendChild(text);
    servicesMenu.appendChild(row);
  }

  updateServicesButton();
}

function openServicesMenu(open) {
  if (!servicesMenu) return;
  servicesMenu.hidden = !open;
  if (open) renderServicesMenu();
}

servicesBtn?.addEventListener("click", () => openServicesMenu(servicesMenu.hidden));

document.addEventListener("click", (e) => {
  if (!servicesMenu || servicesMenu.hidden) return;
  if (servicesWrap && !servicesWrap.contains(e.target)) openServicesMenu(false);
});

// -------------------- SERVICES SETTINGS (Firestore: settings/services) --------------------
function subscribeServicesSettings() {
  return onSnapshot(settingsServicesRef, (snap) => {
    const data = snap.exists() ? snap.data() : {};

    const all = Array.isArray(data.allServices) && data.allServices.length
      ? data.allServices
      : DEFAULT_SERVICES;

    const enabled = Array.isArray(data.enabledServices) && data.enabledServices.length
      ? data.enabledServices
      : all;

    allServices = new Set(all);
    enabledServices = new Set(enabled);

    // remove selections no longer enabled
    for (const s of [...selectedServices]) {
      if (!enabledServices.has(s)) selectedServices.delete(s);
    }

    renderServicesMenu();
    updateServicesButton();

    if (cachedIsAdmin) renderAdminServicesUI();
  });
}

// Admin services UI render
function renderAdminServicesUI() {
  if (!cachedIsAdmin || !adminServicesList) return;

  adminServicesList.innerHTML = "";
  const list = [...allServices].sort((a, b) => a.localeCompare(b));

  for (const name of list) {
    const id = `adminSvc_${name.replaceAll(" ", "_").replaceAll("&", "and")}`;

    const label = document.createElement("label");
    label.htmlFor = id;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = enabledServices.has(name);

    const text = document.createElement("div");
    text.textContent = name;

    label.appendChild(cb);
    label.appendChild(text);
    adminServicesList.appendChild(label);
  }

  if (servicesSaveHint) servicesSaveHint.textContent = "";
  if (addServiceHint) addServiceHint.textContent = "";
}

async function saveEnabledServicesFromAdmin() {
  if (!cachedIsAdmin || !adminServicesList) return;

  const checks = [...adminServicesList.querySelectorAll('input[type="checkbox"]')];
  const chosen = checks
    .filter(c => c.checked)
    .map(c => c.parentElement?.innerText?.trim())
    .filter(Boolean);

  if (!chosen.length) {
    if (servicesSaveHint) servicesSaveHint.textContent = "Pick at least one service.";
    return;
  }

  await setDoc(settingsServicesRef, {
    allServices: [...allServices].sort((a, b) => a.localeCompare(b)),
    enabledServices: chosen.sort((a, b) => a.localeCompare(b)),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null,
    updatedByEmail: (auth.currentUser?.email || "").toLowerCase()
  }, { merge: true });

  if (servicesSaveHint) servicesSaveHint.textContent = `Saved (${chosen.length} enabled). ✅`;
}

async function addNewService() {
  if (!cachedIsAdmin) return;
  if (!newServiceInput) return;

  const raw = newServiceInput.value.trim();
  if (!raw) return;

  // normalise spaces + capitalise first letter (keeps rest as typed)
  const name = raw.replace(/\s+/g, " ").replace(/^./, c => c.toUpperCase());

  if (allServices.has(name)) {
    if (addServiceHint) addServiceHint.textContent = "That service already exists.";
    return;
  }

  const updatedAll = [...allServices, name].sort((a, b) => a.localeCompare(b));
  const updatedEnabled = [...enabledServices, name].sort((a, b) => a.localeCompare(b));

  await setDoc(settingsServicesRef, {
    allServices: updatedAll,
    enabledServices: updatedEnabled,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null,
    updatedByEmail: (auth.currentUser?.email || "").toLowerCase()
  }, { merge: true });

  newServiceInput.value = "";
  if (addServiceHint) addServiceHint.textContent = `Added “${name}” ✅`;
}

saveServicesBtn?.addEventListener("click", saveEnabledServicesFromAdmin);
addServiceBtn?.addEventListener("click", addNewService);
newServiceInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addNewService();
  }
});

// -------------------- SLOT DROPDOWN --------------------
async function refreshSlotDropdown(dateStr) {
  if (!dateStr || !bookTime) return;

  const bookingsQ = query(
    collection(db, "bookings"),
    where("date", "==", dateStr),
    where("status", "==", "active")
  );

  const blockedQ = query(
    collection(db, "blockedSlots"),
    where("date", "==", dateStr)
  );

  const [bookSnap, blockSnap] = await Promise.all([getDocs(bookingsQ), getDocs(blockedQ)]);

  const taken = new Set(bookSnap.docs.map(d => d.data().time));
  const blocked = new Set(blockSnap.docs.map(d => d.data().time));

  bookTime.innerHTML = "";
  let available = 0;

  for (const t of TIMES) {
    const isBlocked = blocked.has(t);
    const isTaken = taken.has(t);
    const disabled = isBlocked || isTaken;

    const opt = document.createElement("option");
    opt.value = t;
    opt.disabled = disabled;
    opt.textContent = t + (isBlocked ? " (blocked)" : (isTaken ? " (taken)" : ""));

    if (!disabled) available++;
    bookTime.appendChild(opt);
  }

  if (slotHint) slotHint.textContent = available ? `${available} slots available` : "No slots available.";

  const firstEnabled = [...bookTime.options].find(o => !o.disabled);
  if (firstEnabled) bookTime.value = firstEnabled.value;
}

function populateBlockTimes() {
  if (!blockTime) return;
  blockTime.innerHTML = "";
  for (const t of TIMES) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    blockTime.appendChild(opt);
  }
}

// -------------------- BOOKING SUBMIT --------------------
bookingForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (bookError) bookError.textContent = "";
  if (bookSuccess) bookSuccess.textContent = "";

  const user = auth.currentUser;
  if (!user) return (bookError.textContent = "Not logged in.");

  const dateStr = bookDate?.value || "";
  const timeStr = bookTime?.value || "";
  const durationMins = Number(bookDuration?.value || 0);
  const servicesArr = [...selectedServices];
  const notes = (bookNotes?.value || "").trim();

  if (!dateStr) return (bookError.textContent = "Pick a date.");
  if (!timeStr) return (bookError.textContent = "Pick a time.");
  if (!servicesArr.length) return (bookError.textContent = "Pick at least one service.");
  if (!durationMins || durationMins < 5) return (bookError.textContent = "Pick a length.");

  // past time check
  const chosen = parseDateInput(dateStr);
  const [hh, mm] = timeStr.split(":").map(Number);
  chosen.setHours(hh, mm, 0, 0);
  if (chosen.getTime() < Date.now() - 30_000) return (bookError.textContent = "That time is in the past.");

  const id = slotId(dateStr, timeStr);
  const bookingRef = doc(db, "bookings", id);
  const blockedRef = doc(db, "blockedSlots", id);

  try {
    await runTransaction(db, async (tx) => {
      const blockedSnap = await tx.get(blockedRef);
      if (blockedSnap.exists()) throw new Error("That slot is blocked.");

      const existing = await tx.get(bookingRef);
      if (existing.exists() && existing.data().status === "active") {
        throw new Error("That slot is already booked.");
      }

      tx.set(bookingRef, {
        id,
        date: dateStr,
        time: timeStr,
        services: servicesArr,
        durationMins,
        notes: notes || "",
        status: "active",
        userId: user.uid,
        userName: user.displayName || "Unknown",
        userEmail: (user.email || "").toLowerCase(),
        createdAt: serverTimestamp(),
      });
    });

    await refreshSlotDropdown(dateStr);

    const emailRes = await trySendEmail({
      to_email: OWNER_EMAIL,
      company_name: "Ripple Relaxation",
      booker_name: user.displayName || "Unknown",
      booker_email: (user.email || "").toLowerCase(),
      booked_date: dateStr,
      booked_time: timeStr,
      booked_services: servicesArr.join(", "),
      booked_duration: `${durationMins} minutes`,
      booked_notes: notes || "(none)",
      reply_to: (user.email || "").toLowerCase(),
    });

    if (bookSuccess) {
      bookSuccess.textContent = emailRes.ok
        ? "Booked! Email sent ✅"
        : `Booked! ✅ (Email: ${emailRes.reason})`;
    }

    // reset services selection
    selectedServices.clear();
    updateServicesButton();
    openServicesMenu(false);

    if (bookNotes) bookNotes.value = "";

    await updateStats();
  } catch (err) {
    if (bookError) bookError.textContent = err?.message || String(err);
    await refreshSlotDropdown(dateStr);
  }
});

// -------------------- MY BOOKINGS (Realtime) --------------------
function subscribeMyBookings(uid) {
  if (unsubMyBookings) unsubMyBookings();

  const qMine = query(
    collection(db, "bookings"),
    where("userId", "==", uid),
    limit(200)
  );

  unsubMyBookings = onSnapshot(
    qMine,
    (snap) => {
      const items = snap.docs.map(d => d.data());

      // Sort client-side by date+time
      items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

      myBookingsList.innerHTML = "";
      if (!items.length) {
        myBookingsList.innerHTML = `<div class="muted">No bookings yet.</div>`;
        return;
      }

      for (const b of items) {
        const servicesText = Array.isArray(b.services) ? b.services.join(", ") : "";
        const el = document.createElement("div");
        el.className = "item";
        el.innerHTML = `
          <div class="meta">
            <div class="title">${escapeHtml(b.date)} at ${escapeHtml(b.time)}</div>
            <div class="badge">${escapeHtml(b.status)}</div>
            <div class="sub">${escapeHtml(servicesText)} • ${escapeHtml(String(b.durationMins || ""))} mins</div>
            ${b.notes ? `<div class="sub">Notes: ${escapeHtml(b.notes)}</div>` : ""}
          </div>
        `;
        myBookingsList.appendChild(el);
      }
    },
    (err) => {
      console.error("My bookings listener error:", err);
      myBookingsList.innerHTML = `<div class="muted">Couldn’t load your bookings (check console).</div>`;
    }
  );
}

// -------------------- ADMIN: BOOKINGS LIST --------------------
async function renderAdminList() {
  if (!cachedIsAdmin || !adminBookingsList) return;

  const qText = (adminSearch?.value || "").trim().toLowerCase();
  const status = adminStatus?.value || "all";
  const date = adminDate?.value || "";

  const snap = await getDocs(query(collection(db, "bookings"), orderBy("date", "desc"), limit(800)));
  let items = snap.docs.map(d => d.data());

  if (status !== "all") items = items.filter(b => b.status === status);
  if (date) items = items.filter(b => b.date === date);
  if (qText) {
    items = items.filter(b => {
      const servicesText = Array.isArray(b.services) ? b.services.join(", ") : "";
      const blob = `${b.userName} ${b.userEmail} ${servicesText} ${b.durationMins || ""} ${b.notes || ""} ${b.date} ${b.time}`.toLowerCase();
      return blob.includes(qText);
    });
  }

  items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  adminBookingsList.innerHTML = "";
  if (!items.length) {
    adminBookingsList.innerHTML = `<div class="muted">No matches.</div>`;
    return;
  }

  for (const b of items) {
    const servicesText = Array.isArray(b.services) ? b.services.join(", ") : "";
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div class="title">${escapeHtml(b.date)} at ${escapeHtml(b.time)}</div>
        <div class="badge">${escapeHtml(b.status)}</div>
        <div class="sub">${escapeHtml(b.userName)} • ${escapeHtml(b.userEmail)}</div>
        <div class="sub">${escapeHtml(servicesText)} • ${escapeHtml(String(b.durationMins || ""))} mins</div>
        ${b.notes ? `<div class="sub">Notes: ${escapeHtml(b.notes)}</div>` : ""}
      </div>
      <div class="actions">
        ${b.status === "active" ? `<button class="btn ghost" data-admin-cancel="${escapeHtml(b.id)}">Cancel</button>` : ""}
      </div>
    `;
    adminBookingsList.appendChild(el);
  }

  adminBookingsList.querySelectorAll("[data-admin-cancel]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.adminCancel;
      await updateDoc(doc(db, "bookings", id), { status: "cancelled", cancelledAt: serverTimestamp() });
      await refreshSlotDropdown(bookDate?.value || "");
      await updateStats();
    });
  });
}

function subscribeAllBookingsIfAdmin() {
  if (unsubAllBookings) unsubAllBookings();
  if (!cachedIsAdmin) return;

  const qAll = query(collection(db, "bookings"), orderBy("date", "desc"), limit(200));
  unsubAllBookings = onSnapshot(qAll, () => renderAdminList());
}

// Admin filters
[adminSearch, adminStatus, adminDate].forEach(el => el?.addEventListener("input", renderAdminList));
adminClearFilters?.addEventListener("click", () => {
  if (!adminSearch || !adminStatus || !adminDate) return;
  adminSearch.value = "";
  adminStatus.value = "all";
  adminDate.value = "";
  renderAdminList();
});

// Admin export CSV
adminExportCsv?.addEventListener("click", async () => {
  if (!cachedIsAdmin) return;

  const snap = await getDocs(query(collection(db, "bookings"), orderBy("date", "asc"), limit(5000)));
  const rows = snap.docs.map(d => d.data());

  const header = ["id","status","date","time","durationMins","services","userName","userEmail","notes"];
  const csv = [
    header.join(","),
    ...rows.map(r => header.map(k => {
      const val = (k === "services" && Array.isArray(r.services)) ? r.services.join(" | ") : (r[k] ?? "");
      return `"${String(val).replaceAll('"','""')}"`
    }).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ripple-relaxation-bookings-${toDateInputValue(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// -------------------- ADMIN: BLOCK/UNBLOCK --------------------
blockSlotBtn?.addEventListener("click", async () => {
  if (!cachedIsAdmin) return;

  const d = blockDate?.value || "";
  const t = blockTime?.value || "";
  if (!d || !t) return;

  const id = slotId(d, t);
  await setDoc(doc(db, "blockedSlots", id), {
    id,
    date: d,
    time: t,
    blockedBy: auth.currentUser?.uid || null,
    blockedByEmail: (auth.currentUser?.email || "").toLowerCase(),
    createdAt: serverTimestamp()
  });

  if (blockHint) blockHint.textContent = `Blocked ${d} ${t}.`;
  await refreshSlotDropdown(bookDate?.value || "");
  await updateStats();
});

unblockSlotBtn?.addEventListener("click", async () => {
  if (!cachedIsAdmin) return;

  const d = blockDate?.value || "";
  const t = blockTime?.value || "";
  if (!d || !t) return;

  const id = slotId(d, t);
  await deleteDoc(doc(db, "blockedSlots", id));

  if (blockHint) blockHint.textContent = `Unblocked ${d} ${t}.`;
  await refreshSlotDropdown(bookDate?.value || "");
  await updateStats();
});

function populateBlockTimesOnLoad() {
  populateBlockTimes();
}

// -------------------- STATS --------------------
async function updateStats() {
  try {
    if (!statActive || !statBlocked) return;
    const activeSnap = await getDocs(query(collection(db, "bookings"), where("status", "==", "active")));
    const blockedSnap = await getDocs(query(collection(db, "blockedSlots"), limit(3000)));
    statActive.textContent = String(activeSnap.size);
    statBlocked.textContent = String(blockedSnap.size);
  } catch {
    // ignore
  }
}

// -------------------- DATE CHANGE --------------------
bookDate?.addEventListener("change", async () => {
  if (bookError) bookError.textContent = "";
  if (bookSuccess) bookSuccess.textContent = "";
  await refreshSlotDropdown(bookDate.value);
});

// -------------------- DASHBOARD TABS --------------------
dashTabs?.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg");
  if (!btn) return;

  const which = btn.dataset.view;
  if (which === "admin" && !cachedIsAdmin) return;
  setDashView(which);
});

// -------------------- SIGNUP / LOGIN / LOGOUT --------------------
signupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (signupError) signupError.textContent = "";

  const name = (signupName?.value || "").trim();
  const email = (signupEmail?.value || "").trim();
  const pass = signupPass?.value || "";

  if (!name) return (signupError.textContent = "Please enter your name.");
  if (!email) return (signupError.textContent = "Please enter an email.");
  if (!pass || pass.length < 6) return (signupError.textContent = "Password must be at least 6 characters.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });

    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email: (cred.user.email || "").toLowerCase(),
      createdAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    signupError.textContent = err?.message || String(err);
  }
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (loginError) loginError.textContent = "";

  const email = (loginEmail?.value || "").trim();
  const pass = loginPass?.value || "";

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    loginError.textContent = err?.message || String(err);
  }
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
});

// -------------------- AUTH STATE --------------------
onAuthStateChanged(auth, async (user) => {
  // cleanup subs
  if (unsubMyBookings) { unsubMyBookings(); unsubMyBookings = null; }
  if (unsubAllBookings) { unsubAllBookings(); unsubAllBookings = null; }
  if (unsubServicesSettings) { unsubServicesSettings(); unsubServicesSettings = null; }

  cachedIsAdmin = false;

  if (!user) {
    authView.hidden = false;
    dashView.hidden = true;
    topActions.hidden = true;
    adminTab.hidden = true;
    return;
  }

  await checkAdmin(user);

  // Everyone subscribes so booking dropdown always matches admin setting
  unsubServicesSettings = subscribeServicesSettings();

  // show dashboard
  authView.hidden = true;
  dashView.hidden = false;
  topActions.hidden = false;

  adminTab.hidden = !cachedIsAdmin;

  if (whoami) whoami.textContent = `${user.displayName || "User"}${cachedIsAdmin ? " • Admin" : ""} • ${user.email}`;

  // set date defaults
  const today = new Date();
  if (bookDate) {
    bookDate.min = toDateInputValue(today);
    if (!bookDate.value) bookDate.value = toDateInputValue(today);
  }
  if (blockDate && !blockDate.value) blockDate.value = toDateInputValue(today);

  setTodayLine();

  // dropdowns + menus
  populateDurationDropdown();
  openServicesMenu(false);
  updateServicesButton();
  renderServicesMenu();

  populateBlockTimesOnLoad();

  await refreshSlotDropdown(bookDate?.value || "");
  await updateStats();

  // my bookings
  subscribeMyBookings(user.uid);

  // admin extras
  if (cachedIsAdmin) {
    renderAdminServicesUI();
    subscribeAllBookingsIfAdmin();
    renderAdminList();
  }

  setDashView("book");
});

