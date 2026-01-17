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
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------- config ----------
const CFG = window.RR_CONFIG || {};
const OWNER_EMAIL = (CFG.OWNER_EMAIL || "").trim();
const ADMIN_EMAILS = (CFG.ADMIN_EMAILS || []).map(e => String(e).toLowerCase().trim());
const EMAILCFG = CFG.EMAILJS || { ENABLED: true, PUBLIC_KEY: "", SERVICE_ID: "", TEMPLATE_ID: "" };
const SLOT = CFG.SLOTS || { START_HOUR: 9, END_HOUR: 17, STEP_MIN: 30 };

if (!CFG.FIREBASE?.apiKey) {
  alert("Firebase config missing. Paste FIREBASE config into config.js");
}

const app = initializeApp(CFG.FIREBASE);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- dom ----------
const $ = (s) => document.querySelector(s);

const authView = $("#authView");
const dashView = $("#dashView");
const topActions = $("#topActions");
const whoami = $("#whoami");
const logoutBtn = $("#logoutBtn");

const tabs = document.querySelectorAll(".tab");
const loginPanel = $("#loginPanel");
const signupPanel = $("#signupPanel");

const loginForm = $("#loginForm");
const loginEmail = $("#loginEmail");
const loginPass = $("#loginPass");
const loginError = $("#loginError");

const signupForm = $("#signupForm");
const signupName = $("#signupName");
const signupEmail = $("#signupEmail");
const signupPass = $("#signupPass");
const signupError = $("#signupError");

const dashTabs = $("#dashTabs");
const adminTab = $("#adminTab");
const viewBook = $("#viewBook");
const viewMine = $("#viewMine");
const viewAdmin = $("#viewAdmin");

const bookingForm = $("#bookingForm");
const bookDate = $("#bookDate");
const bookTime = $("#bookTime");
const bookNotes = $("#bookNotes");
const bookError = $("#bookError");
const bookSuccess = $("#bookSuccess");
const slotHint = $("#slotHint");

const myBookingsList = $("#myBookingsList");

const todayLine = $("#todayLine");
const statActive = $("#statActive");
const statBlocked = $("#statBlocked");

const adminSearch = $("#adminSearch");
const adminStatus = $("#adminStatus");
const adminDate = $("#adminDate");
const adminClearFilters = $("#adminClearFilters");
const adminExportCsv = $("#adminExportCsv");
const adminBookingsList = $("#adminBookingsList");

const blockDate = $("#blockDate");
const blockTime = $("#blockTime");
const blockSlotBtn = $("#blockSlotBtn");
const unblockSlotBtn = $("#unblockSlotBtn");
const blockHint = $("#blockHint");

$("#year").textContent = new Date().getFullYear();

// ---------- state ----------
let unsubMyBookings = null;
let unsubAllBookings = null;
let unsubBlocked = null;

// ---------- utils ----------
function isAdminUser(user) {
  const email = (user?.email || "").toLowerCase().trim();
  return ADMIN_EMAILS.includes(email);
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

function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slotId(dateStr, timeStr) {
  // unique slot id for bookings & blocked
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
  const d = new Date();
  todayLine.textContent = d.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

function setDashView(which) {
  for (const b of dashTabs.querySelectorAll(".seg")) b.classList.remove("active");
  dashTabs.querySelector(`.seg[data-view="${which}"]`)?.classList.add("active");

  [viewBook, viewMine, viewAdmin].forEach(v => v.classList.remove("show"));
  if (which === "mine") viewMine.classList.add("show");
  else if (which === "admin") viewAdmin.classList.add("show");
  else viewBook.classList.add("show");
}

// ---------- auth tabs ----------
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    loginError.textContent = "";
    signupError.textContent = "";
    if (tab === "login") {
      loginPanel.classList.add("show");
      signupPanel.classList.remove("show");
    } else {
      signupPanel.classList.add("show");
      loginPanel.classList.remove("show");
    }
  });
});

// ---------- auth handlers ----------
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  signupError.textContent = "";

  const name = signupName.value.trim();
  const email = signupEmail.value.trim();
  const pass = signupPass.value;

  if (!name) return (signupError.textContent = "Please enter your name.");
  if (!email) return (signupError.textContent = "Please enter an email.");
  if (!pass || pass.length < 6) return (signupError.textContent = "Password must be at least 6 characters.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });

    // store public profile (optional)
    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email: (cred.user.email || "").toLowerCase(),
      createdAt: serverTimestamp()
    }, { merge: true });

  } catch (err) {
    signupError.textContent = err?.message || String(err);
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";

  const email = loginEmail.value.trim();
  const pass = loginPass.value;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    loginError.textContent = err?.message || String(err);
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// ---------- email (optional) ----------
async function trySendEmail(booking) {
  if (!EMAILCFG?.ENABLED) return { ok: false, reason: "disabled" };
  if (!OWNER_EMAIL) return { ok: false, reason: "owner email missing" };
  if (!EMAILCFG.PUBLIC_KEY || !EMAILCFG.SERVICE_ID || !EMAILCFG.TEMPLATE_ID) {
    return { ok: false, reason: "EmailJS not configured (config.js)" };
  }
  if (!window.emailjs?.init) return { ok: false, reason: "EmailJS library missing" };

  try {
    emailjs.init(EMAILCFG.PUBLIC_KEY);
    const res = await emailjs.send(EMAILCFG.SERVICE_ID, EMAILCFG.TEMPLATE_ID, {
      to_email: OWNER_EMAIL,
      company_name: "Ripple Relaxation",
      booker_name: booking.userName,
      booker_email: booking.userEmail,
      booked_date: booking.date,
      booked_time: booking.time,
      booked_notes: booking.notes || "(none)",
      reply_to: booking.userEmail
    });
    return { ok: true, reason: `sent (status ${res.status})` };
  } catch (e) {
    const msg =
      (e && typeof e === "object" && ("text" in e) && e.text) ? e.text :
      (e && typeof e === "object" && ("message" in e) && e.message) ? e.message :
      String(e);
    console.error(e);
    return { ok: false, reason: msg };
  }
}

// ---------- bookings + blocked (realtime) ----------
async function refreshSlotDropdown(dateStr) {
  // fetch bookings for that day + blocked for that day (via queries)
  // for simplicity: read all active bookings that day (small dataset)
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
    const isTaken = taken.has(t) || blocked.has(t);
    const opt = document.createElement("option");
    opt.value = t;
    opt.disabled = isTaken;
    opt.textContent = t + (blocked.has(t) ? " (blocked)" : (taken.has(t) ? " (taken)" : ""));
    if (!isTaken) available++;
    bookTime.appendChild(opt);
  }

  slotHint.textContent = available ? `${available} slots available` : "No slots available.";

  const firstEnabled = [...bookTime.options].find(o => !o.disabled);
  if (firstEnabled) bookTime.value = firstEnabled.value;
}

bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  bookError.textContent = "";
  bookSuccess.textContent = "";

  const user = auth.currentUser;
  if (!user) return (bookError.textContent = "Not logged in.");

  const dateStr = bookDate.value;
  const timeStr = bookTime.value;
  const notes = bookNotes.value.trim();

  if (!dateStr) return (bookError.textContent = "Pick a date.");
  if (!timeStr) return (bookError.textContent = "Pick a time.");

  const chosen = parseDateInput(dateStr);
  const [hh, mm] = timeStr.split(":").map(Number);
  chosen.setHours(hh, mm, 0, 0);
  if (chosen.getTime() < Date.now() - 30_000) return (bookError.textContent = "That time is in the past.");

  const slotDocId = slotId(dateStr, timeStr);
  const bookingRef = doc(db, "bookings", slotDocId);
  const blockedRef = doc(db, "blockedSlots", slotDocId);

  // Transaction prevents double-booking
  try {
    await runTransaction(db, async (tx) => {
      const blockedSnap = await tx.get(blockedRef);
      if (blockedSnap.exists()) throw new Error("That slot is blocked.");

      const existing = await tx.get(bookingRef);
      if (existing.exists() && existing.data().status === "active") {
        throw new Error("That slot is already booked.");
      }

      tx.set(bookingRef, {
        id: slotDocId,
        date: dateStr,
        time: timeStr,
        notes: notes || "",
        status: "active",
        userId: user.uid,
        userName: user.displayName || "Unknown",
        userEmail: (user.email || "").toLowerCase(),
        createdAt: serverTimestamp()
      });
    });

    await refreshSlotDropdown(dateStr);

    const emailRes = await trySendEmail({
      date: dateStr,
      time: timeStr,
      notes,
      userName: user.displayName || "Unknown",
      userEmail: (user.email || "").toLowerCase()
    });

    bookSuccess.textContent = emailRes.ok
      ? "Booked! Email sent ✅"
      : `Booked! ✅ (Email: ${emailRes.reason})`;

    bookNotes.value = "";

  } catch (err) {
    bookError.textContent = err?.message || String(err);
    await refreshSlotDropdown(dateStr);
  }
});

// My bookings realtime
function subscribeMyBookings(uid) {
  if (unsubMyBookings) unsubMyBookings();

  const qMine = query(
    collection(db, "bookings"),
    where("userId", "==", uid),
    orderBy("date", "desc"),
    limit(100)
  );

  unsubMyBookings = onSnapshot(qMine, (snap) => {
    const items = snap.docs.map(d => d.data())
      .sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time));

    myBookingsList.innerHTML = "";
    if (!items.length) {
      myBookingsList.innerHTML = `<div class="muted">No bookings yet.</div>`;
      return;
    }

    for (const b of items) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="meta">
          <div class="title">${escapeHtml(b.date)} at ${escapeHtml(b.time)}</div>
          <div class="badge">${escapeHtml(b.status)}</div>
          ${b.notes ? `<div class="sub">Notes: ${escapeHtml(b.notes)}</div>` : ""}
        </div>
        <div class="actions">
          ${b.status === "active" ? `<button class="btn ghost" data-cancel="${escapeHtml(b.id)}">Cancel</button>` : ""}
        </div>
      `;
      myBookingsList.appendChild(el);
    }

    myBookingsList.querySelectorAll("[data-cancel]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.cancel;
        const ref = doc(db, "bookings", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        if (snap.data().userId !== auth.currentUser.uid) return;
        await updateDoc(ref, { status: "cancelled", cancelledAt: serverTimestamp() });
        await refreshSlotDropdown(bookDate.value);
      });
    });
  });
}

// Admin realtime (all bookings)
function subscribeAllBookings() {
  if (unsubAllBookings) unsubAllBookings();

  const qAll = query(collection(db, "bookings"), orderBy("date", "desc"), limit(200));
  unsubAllBookings = onSnapshot(qAll, () => renderAdminList());
}

function subscribeBlocked() {
  if (unsubBlocked) unsubBlocked();
  const qBlk = query(collection(db, "blockedSlots"), orderBy("date", "desc"), limit(300));
  unsubBlocked = onSnapshot(qBlk, () => updateStats());
}

async function renderAdminList() {
  const user = auth.currentUser;
  if (!user || !isAdminUser(user)) return;

  const qText = (adminSearch.value || "").trim().toLowerCase();
  const status = adminStatus.value;
  const date = adminDate.value;

  // For simplicity: read latest 500 bookings and filter client-side (fine for small apps)
  const snap = await getDocs(query(collection(db, "bookings"), orderBy("date", "desc"), limit(500)));
  let items = snap.docs.map(d => d.data());

  if (status !== "all") items = items.filter(b => b.status === status);
  if (date) items = items.filter(b => b.date === date);
  if (qText) {
    items = items.filter(b => {
      const blob = `${b.userName} ${b.userEmail} ${b.notes || ""} ${b.date} ${b.time}`.toLowerCase();
      return blob.includes(qText);
    });
  }

  // sort ascending for readability
  items.sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time));

  adminBookingsList.innerHTML = "";
  if (!items.length) {
    adminBookingsList.innerHTML = `<div class="muted">No matches.</div>`;
    return;
  }

  for (const b of items) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div class="title">${escapeHtml(b.date)} at ${escapeHtml(b.time)}</div>
        <div class="badge">${escapeHtml(b.status)}</div>
        <div class="sub">${escapeHtml(b.userName)} • ${escapeHtml(b.userEmail)}</div>
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
      await refreshSlotDropdown(bookDate.value);
    });
  });
}

async function updateStats() {
  // active bookings count (simple)
  const activeSnap = await getDocs(query(collection(db, "bookings"), where("status", "==", "active")));
  const blockedSnap = await getDocs(query(collection(db, "blockedSlots")));
  statActive.textContent = String(activeSnap.size);
  statBlocked.textContent = String(blockedSnap.size);
}

// Admin block/unblock
async function populateBlockTimes(dateStr) {
  blockTime.innerHTML = "";
  for (const t of TIMES) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    blockTime.appendChild(opt);
  }
}

blockSlotBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user || !isAdminUser(user)) return;

  const d = blockDate.value;
  const t = blockTime.value;
  if (!d || !t) return;

  const id = slotId(d, t);
  await setDoc(doc(db, "blockedSlots", id), {
    id,
    date: d,
    time: t,
    blockedBy: user.uid,
    blockedByEmail: (user.email || "").toLowerCase(),
    createdAt: serverTimestamp()
  });
  blockHint.textContent = `Blocked ${d} ${t}.`;
  await refreshSlotDropdown(bookDate.value);
  await updateStats();
});

unblockSlotBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user || !isAdminUser(user)) return;

  const d = blockDate.value;
  const t = blockTime.value;
  if (!d || !t) return;

  const id = slotId(d, t);
  // easiest unblock: set deleted flag? We'll actually delete by overwriting with status? (Firestore delete not imported)
  // We'll "soft delete" by setting a field; rules still allow reading. For UI, we treat exists as blocked.
  // Better: import deleteDoc. We'll do that properly:
});


// (small patch: deleteDoc import)
import { deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
unblockSlotBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user || !isAdminUser(user)) return;

  const d = blockDate.value;
  const t = blockTime.value;
  if (!d || !t) return;

  const id = slotId(d, t);
  await deleteDoc(doc(db, "blockedSlots", id));
  blockHint.textContent = `Unblocked ${d} ${t}.`;
  await refreshSlotDropdown(bookDate.value);
  await updateStats();
});

// Admin filters
[adminSearch, adminStatus, adminDate].forEach(el => el.addEventListener("input", renderAdminList));
adminClearFilters.addEventListener("click", () => {
  adminSearch.value = "";
  adminStatus.value = "all";
  adminDate.value = "";
  renderAdminList();
});
adminExportCsv.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user || !isAdminUser(user)) return;

  const snap = await getDocs(query(collection(db, "bookings"), orderBy("date", "asc")));
  const rows = snap.docs.map(d => d.data());

  const header = ["id","status","date","time","userName","userEmail","notes"];
  const csv = [
    header.join(","),
    ...rows.map(r => header.map(k => `"${String(r[k] ?? "").replaceAll('"','""')}"`).join(","))
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

// Date change
bookDate.addEventListener("change", async () => {
  bookError.textContent = "";
  bookSuccess.textContent = "";
  await refreshSlotDropdown(bookDate.value);
});

// Dashboard tabs
dashTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg");
  if (!btn) return;
  const which = btn.dataset.view;

  if (which === "admin" && !isAdminUser(auth.currentUser)) return;
  setDashView(which);
});

// ---------- main auth state ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    authView.hidden = false;
    dashView.hidden = true;
    topActions.hidden = true;

    if (unsubMyBookings) unsubMyBookings();
    if (unsubAllBookings) unsubAllBookings();
    if (unsubBlocked) unsubBlocked();
    unsubMyBookings = unsubAllBookings = unsubBlocked = null;
    return;
  }

  authView.hidden = true;
  dashView.hidden = false;
  topActions.hidden = false;

  const admin = isAdminUser(user);
  adminTab.hidden = !admin;

  whoami.textContent = `${user.displayName || "User"}${admin ? " • Admin" : ""} • ${user.email}`;

  const today = new Date();
  bookDate.min = toDateInputValue(today);
  if (!bookDate.value) bookDate.value = toDateInputValue(today);
  if (!blockDate.value) blockDate.value = toDateInputValue(today);

  await refreshSlotDropdown(bookDate.value);
  await populateBlockTimes(blockDate.value);

  setTodayLine();
  await updateStats();

  subscribeMyBookings(user.uid);
  subscribeBlocked();
  if (admin) {
    subscribeAllBookings();
    renderAdminList();
  }

  setDashView("book");
});
