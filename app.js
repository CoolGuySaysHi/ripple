const CFG = window.RR_CONFIG || {};
const BROTHER_EMAIL = CFG.BROTHER_EMAIL || "fairfieldg2016@gmail.com";
const ADMIN_CODE = CFG.ADMIN_CODE || "";
const EMAILCFG = CFG.EMAILJS || { ENABLED: true, PUBLIC_KEY: "", SERVICE_ID: "", TEMPLATE_ID: "" };
const SLOT = CFG.SLOTS || { START_HOUR: 9, END_HOUR: 17, STEP_MIN: 30 };

const LS = {
  USERS: "rr_users_v3",
  SESSION: "rr_session_v3",
  BOOKINGS: "rr_bookings_v3",
  BLOCKED: "rr_blocked_v3",
};

const $ = (sel) => document.querySelector(sel);

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
const signupAdminCode = $("#signupAdminCode");
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

// Admin controls
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

// ---------- storage ----------
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function nowISO() { return new Date().toISOString(); }

function hashLike(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `h${h.toString(16)}`;
}

function getUsers() { return load(LS.USERS, []); }
function setUsers(users) { save(LS.USERS, users); }

function getBookings() { return load(LS.BOOKINGS, []); }
function setBookings(bookings) { save(LS.BOOKINGS, bookings); }

function getSession() { return load(LS.SESSION, null); }
function setSession(sess) { save(LS.SESSION, sess); }

function getBlocked() { return load(LS.BLOCKED, {}); }
function setBlocked(obj) { save(LS.BLOCKED, obj); }

function normalizeEmail(e) { return (e || "").trim().toLowerCase(); }
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
function slotKey(dateStr, timeStr) { return `${dateStr}__${timeStr}`; }

// ---------- slots ----------
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

function populateTimes(selectEl, dateStr) {
  selectEl.innerHTML = "";
  const bookings = getBookings();
  const blocked = getBlocked();

  const used = new Set(
    bookings.filter(b => b.date === dateStr && b.status === "active").map(b => b.time)
  );

  let availableCount = 0;

  for (const t of TIMES) {
    const key = slotKey(dateStr, t);
    const isBlocked = Boolean(blocked[key]);
    const isTaken = used.has(t) || isBlocked;

    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t + (isBlocked ? " (blocked)" : (used.has(t) ? " (taken)" : ""));
    opt.disabled = isTaken;

    if (!opt.disabled) availableCount++;
    selectEl.appendChild(opt);
  }

  if (selectEl === bookTime) {
    slotHint.textContent = availableCount ? `${availableCount} slots available` : "No slots available.";
  }

  const firstEnabled = [...selectEl.options].find(o => !o.disabled);
  if (firstEnabled) selectEl.value = firstEnabled.value;
}

// ---------- navigation ----------
function setDashView(which) {
  for (const b of dashTabs.querySelectorAll(".seg")) b.classList.remove("active");
  dashTabs.querySelector(`.seg[data-view="${which}"]`)?.classList.add("active");

  [viewBook, viewMine, viewAdmin].forEach(v => v.classList.remove("show"));
  if (which === "mine") viewMine.classList.add("show");
  else if (which === "admin") viewAdmin.classList.add("show");
  else viewBook.classList.add("show");

  if (which === "mine") renderMyBookings();
  if (which === "admin") renderAdmin();
}

dashTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg");
  if (!btn) return;
  const which = btn.dataset.view;
  if (which === "admin" && !currentUser()?.isAdmin) return;
  setDashView(which);
});

// ---------- auth tabs ----------
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    if (tab === "login") {
      loginPanel.classList.add("show");
      signupPanel.classList.remove("show");
      loginError.textContent = "";
      signupError.textContent = "";
    } else {
      signupPanel.classList.add("show");
      loginPanel.classList.remove("show");
      loginError.textContent = "";
      signupError.textContent = "";
    }
  });
});

// ---------- signup/login ----------
signupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  signupError.textContent = "";

  const name = signupName.value.trim();
  const email = normalizeEmail(signupEmail.value);
  const pass = signupPass.value;
  const enteredAdminCode = (signupAdminCode?.value || "").trim();

  if (!name) return (signupError.textContent = "Please enter your name.");
  if (!email) return (signupError.textContent = "Please enter an email.");
  if (!pass || pass.length < 6) return (signupError.textContent = "Password must be at least 6 characters.");

  const users = getUsers();
  if (users.some(u => u.email === email)) return (signupError.textContent = "That email already exists. Log in instead.");

  const isAdmin = ADMIN_CODE && enteredAdminCode === ADMIN_CODE;

  const newUser = {
    id: crypto.randomUUID ? crypto.randomUUID() : `u_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name,
    email,
    passHash: hashLike(pass),
    isAdmin,
    createdAt: nowISO(),
  };

  users.push(newUser);
  setUsers(users);
  setSession({ userId: newUser.id, at: nowISO() });
  render();
});

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  loginError.textContent = "";

  const email = normalizeEmail(loginEmail.value);
  const pass = loginPass.value;

  const users = getUsers();
  const user = users.find(u => u.email === email);
  if (!user) return (loginError.textContent = "No account with that email.");

  if (user.passHash !== hashLike(pass)) return (loginError.textContent = "Wrong password.");

  setSession({ userId: user.id, at: nowISO() });
  render();
});

logoutBtn.addEventListener("click", () => { setSession(null); render(); });

// ---------- bookings ----------
bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  bookError.textContent = "";
  bookSuccess.textContent = "";

  const user = currentUser();
  if (!user) return (bookError.textContent = "You are not logged in.");

  const dateStr = bookDate.value;
  const timeStr = bookTime.value;
  const notes = bookNotes.value.trim();

  if (!dateStr) return (bookError.textContent = "Pick a date.");
  if (!timeStr) return (bookError.textContent = "Pick a time.");

  const chosenDate = parseDateInput(dateStr);
  const [hh, mm] = timeStr.split(":").map(Number);
  chosenDate.setHours(hh, mm, 0, 0);

  if (chosenDate.getTime() < Date.now() - 30 * 1000) {
    return (bookError.textContent = "That time is in the past.");
  }

  const blocked = getBlocked();
  if (blocked[slotKey(dateStr, timeStr)]) {
    populateTimes(bookTime, dateStr);
    return (bookError.textContent = "That slot is blocked.");
  }

  const bookings = getBookings();
  const taken = bookings.some(b => b.status === "active" && b.date === dateStr && b.time === timeStr);
  if (taken) {
    populateTimes(bookTime, dateStr);
    return (bookError.textContent = "That slot was just taken.");
  }

  const booking = {
    id: crypto.randomUUID ? crypto.randomUUID() : `b_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    date: dateStr,
    time: timeStr,
    notes,
    status: "active",
    createdAt: nowISO(),
  };

  bookings.push(booking);
  setBookings(bookings);

  populateTimes(bookTime, dateStr);
  renderMyBookings();
  updateStats();

  // Auto email attempt (if enabled + configured)
  const didSend = await trySendEmail(booking);
  bookSuccess.textContent = didSend ? "Booked! Email sent ✅" : "Booked! ✅";

  bookNotes.value = "";
});

function cancelBooking(id, asAdmin = false) {
  const bookings = getBookings();
  const idx = bookings.findIndex(b => b.id === id);
  if (idx === -1) return;

  const user = currentUser();
  if (!user) return;

  if (!asAdmin && bookings[idx].userId !== user.id) return;
  if (asAdmin && !user.isAdmin) return;

  bookings[idx].status = "cancelled";
  bookings[idx].cancelledAt = nowISO();
  bookings[idx].cancelledBy = asAdmin ? "admin" : "user";
  setBookings(bookings);

  populateTimes(bookTime, bookDate.value);
  renderMyBookings();
  renderAdmin();
  updateStats();
}

function renderMyBookings() {
  const user = currentUser();
  if (!user) return;

  const bookings = getBookings()
    .filter(b => b.userId === user.id)
    .sort((a,b) => new Date(`${a.date}T${a.time}:00`) - new Date(`${b.date}T${b.time}:00`));

  myBookingsList.innerHTML = "";
  if (!bookings.length) {
    myBookingsList.innerHTML = `<div class="muted">No bookings yet.</div>`;
    return;
  }

  for (const b of bookings) {
    const when = new Date(`${b.date}T${b.time}:00`);
    const isPast = when.getTime() < Date.now();
    const status = b.status === "active" ? (isPast ? "completed" : "active") : "cancelled";

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div class="title">${escapeHtml(b.date)} at ${escapeHtml(b.time)}</div>
        <div class="badge">${status}</div>
        ${b.notes ? `<div class="sub">Notes: ${escapeHtml(b.notes)}</div>` : ""}
      </div>
      <div class="actions">
        ${b.status === "active" && !isPast ? `<button class="btn ghost" data-cancel="${b.id}">Cancel</button>` : ""}
      </div>
    `;
    myBookingsList.appendChild(el);
  }

  myBookingsList.querySelectorAll("[data-cancel]").forEach(btn => {
    btn.addEventListener("click", () => cancelBooking(btn.dataset.cancel, false));
  });
}

// ---------- admin ----------
function renderAdmin() {
  if (!currentUser()?.isAdmin) return;

  const q = (adminSearch.value || "").trim().toLowerCase();
  const status = adminStatus.value;
  const date = adminDate.value;

  const bookings = getBookings().slice().sort(
    (a,b) => new Date(`${a.date}T${a.time}:00`) - new Date(`${b.date}T${b.time}:00`)
  );

  const filtered = bookings.filter(b => {
    if (status !== "all" && b.status !== status) return false;
    if (date && b.date !== date) return false;
    if (q) {
      const blob = `${b.userName} ${b.userEmail} ${b.notes || ""} ${b.date} ${b.time}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  adminBookingsList.innerHTML = "";
  if (!filtered.length) {
    adminBookingsList.innerHTML = `<div class="muted">No matches.</div>`;
    return;
  }

  for (const b of filtered) {
    const when = new Date(`${b.date}T${b.time}:00`);
    const isPast = when.getTime() < Date.now();
    const badge = b.status === "active" ? (isPast ? "completed" : "active") : "cancelled";

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div class="title">${escapeHtml(b.date)} at ${escapeHtml(b.time)}</div>
        <div class="badge">${badge}</div>
        <div class="sub">${escapeHtml(b.userName)} • ${escapeHtml(b.userEmail)}</div>
        ${b.notes ? `<div class="sub">Notes: ${escapeHtml(b.notes)}</div>` : ""}
      </div>
      <div class="actions">
        ${b.status === "active" ? `<button class="btn ghost" data-admin-cancel="${b.id}">Cancel</button>` : ""}
      </div>
    `;
    adminBookingsList.appendChild(el);
  }

  adminBookingsList.querySelectorAll("[data-admin-cancel]").forEach(btn => {
    btn.addEventListener("click", () => cancelBooking(btn.dataset.adminCancel, true));
  });
}

function exportBookingsCsv() {
  if (!currentUser()?.isAdmin) return;
  const bookings = getBookings().slice().sort(
    (a,b) => new Date(`${a.date}T${a.time}:00`) - new Date(`${b.date}T${b.time}:00`)
  );

  const header = ["id","status","date","time","userName","userEmail","notes","createdAt","cancelledAt","cancelledBy"];
  const rows = bookings.map(b => header.map(k => `"${String(b[k] ?? "").replaceAll('"','""')}"`));
  const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ripple-relaxation-bookings-${toDateInputValue(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function blockSlot(dateStr, timeStr) {
  if (!currentUser()?.isAdmin) return;
  if (!dateStr || !timeStr) return (blockHint.textContent = "Pick a date and time.");
  const key = slotKey(dateStr, timeStr);
  const blocked = getBlocked();
  blocked[key] = { by: currentUser().id, at: nowISO() };
  setBlocked(blocked);
  blockHint.textContent = `Blocked ${dateStr} ${timeStr}.`;
  populateTimes(bookTime, bookDate.value);
  populateTimes(blockTime, blockDate.value);
  updateStats();
}

function unblockSlot(dateStr, timeStr) {
  if (!currentUser()?.isAdmin) return;
  if (!dateStr || !timeStr) return (blockHint.textContent = "Pick a date and time.");
  const key = slotKey(dateStr, timeStr);
  const blocked = getBlocked();
  if (!blocked[key]) return (blockHint.textContent = "That slot isn’t blocked.");
  delete blocked[key];
  setBlocked(blocked);
  blockHint.textContent = `Unblocked ${dateStr} ${timeStr}.`;
  populateTimes(bookTime, bookDate.value);
  populateTimes(blockTime, blockDate.value);
  updateStats();
}

[adminSearch, adminStatus, adminDate].forEach(el => el.addEventListener("input", renderAdmin));
adminClearFilters.addEventListener("click", () => {
  adminSearch.value = "";
  adminStatus.value = "all";
  adminDate.value = "";
  renderAdmin();
});
adminExportCsv.addEventListener("click", exportBookingsCsv);

blockSlotBtn.addEventListener("click", () => blockSlot(blockDate.value, blockTime.value));
unblockSlotBtn.addEventListener("click", () => unblockSlot(blockDate.value, blockTime.value));
blockDate.addEventListener("change", () => { blockHint.textContent = ""; if (blockDate.value) populateTimes(blockTime, blockDate.value); });

// ---------- email (auto) ----------
async function trySendEmail(booking) {
  if (!EMAILCFG.ENABLED) return false;
  if (!EMAILCFG.PUBLIC_KEY || !EMAILCFG.SERVICE_ID || !EMAILCFG.TEMPLATE_ID) return false;
  if (!window.emailjs?.init) return false;

  try {
    emailjs.init(EMAILCFG.PUBLIC_KEY);
    await emailjs.send(EMAILCFG.SERVICE_ID, EMAILCFG.TEMPLATE_ID, {
      to_email: BROTHER_EMAIL,
      company_name: "Ripple Relaxation",
      booker_name: booking.userName,
      booker_email: booking.userEmail,
      booked_date: booking.date,
      booked_time: booking.time,
      booked_notes: booking.notes || "(none)",
    });
    return true;
  } catch (e) {
    console.error("Email send failed:", e);
    return false;
  }
}

// ---------- session ----------
function currentUser() {
  const sess = getSession();
  if (!sess?.userId) return null;
  return getUsers().find(u => u.id === sess.userId) || null;
}

// ---------- stats ----------
function updateStats() {
  const bookings = getBookings();
  const blocked = getBlocked();
  statActive.textContent = String(bookings.filter(b => b.status === "active").length);
  statBlocked.textContent = String(Object.keys(blocked).length);
}

function setTodayLine() {
  const d = new Date();
  todayLine.textContent = d.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

// ---------- render ----------
function render() {
  const user = currentUser();

  if (!user) {
    authView.hidden = false;
    dashView.hidden = true;
    topActions.hidden = true;
    return;
  }

  authView.hidden = true;
  dashView.hidden = false;
  topActions.hidden = false;

  whoami.textContent = `${user.name}${user.isAdmin ? " • Admin" : ""} • ${user.email}`;
  adminTab.hidden = !user.isAdmin;

  const today = new Date();
  bookDate.min = toDateInputValue(today);
  if (!bookDate.value) bookDate.value = toDateInputValue(today);
  if (!blockDate.value) blockDate.value = toDateInputValue(today);

  populateTimes(bookTime, bookDate.value);
  populateTimes(blockTime, blockDate.value);

  setTodayLine();
  updateStats();

  setDashView("book");
}

bookDate.addEventListener("change", () => {
  bookError.textContent = "";
  bookSuccess.textContent = "";
  if (bookDate.value) populateTimes(bookTime, bookDate.value);
});

render();
