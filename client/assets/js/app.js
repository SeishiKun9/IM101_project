const itemsElement = document.querySelector("#items");
const search = document.querySelector("#search");
const dashboard = document.querySelector("#dashboard");
const authButton = document.querySelector(".sign-in");
const campusMap = document.querySelector("#campus-map");
const mapImage = document.createElement("img");
mapImage.className = "map-image";
mapImage.src = "/assets/images/campus-map.jpg";
campusMap.prepend(mapImage);
campusMap
  .querySelectorAll(".map-label, .map-gate")
  .forEach((label) => label.remove());
const proofPhotoField = document.querySelector("#proof-photo-field");
const personNameField = document.createElement("label");
personNameField.innerHTML =
  'Name <span class="optional" id="person-name-hint">person who lost the item</span><input name="personName" placeholder="Full name" required>';
document
  .querySelector('#report-form input[name="contact"]')
  .closest("label")
  .before(personNameField);
const reportError = document.createElement("p");
reportError.className = "form-error";
reportError.hidden = true;
reportError.setAttribute("role", "alert");
document
  .querySelector('#report-form textarea[name="description"]')
  .before(reportError);
const signupError = document.createElement("p");
signupError.className = "auth-error";
signupError.hidden = true;
signupError.setAttribute("role", "alert");
document
  .querySelector('#signup-form button[type="submit"]')
  .before(signupError);
proofPhotoField.hidden = true;
const state = {
  filter: "all",
  role: null,
  selectedRole: null,
  user: JSON.parse(localStorage.getItem("campusUser") || "null"),
  accounts: JSON.parse(localStorage.getItem("campusAccounts") || "[]"),
  items: JSON.parse(localStorage.getItem("campusItems") || "[]"),
};
function persistItems() {
  localStorage.setItem("campusItems", JSON.stringify(state.items));
}
function openRolePage(role) {
  window.location.href = `/${role === "staff" ? "verifier" : role === "admin" ? "administrator" : "client"}.html`;
}

function renderItems(query = "") {
  const normalized = query.toLowerCase().trim();
  const visible = state.items.filter(
    (item) =>
      (state.filter === "all" || item.type === state.filter) &&
      `${item.title} ${item.location} ${item.category}`
        .toLowerCase()
        .includes(normalized),
  );
  itemsElement.innerHTML = visible.length
    ? visible
        .map(
          (item) =>
            `<article class="item-card">${item.image ? `<img class="item-thumb" src="${item.image}" alt="${item.title}">` : `<div class="item-icon ${item.type === "lost" ? "gold" : "green"}">${item.type === "lost" ? "▣" : "◒"}</div>`}<div><span class="tag ${item.type === "lost" ? "lost" : "found"}">${item.type.toUpperCase()}</span><h3>${item.title}</h3><p>${item.location} · ${item.floor}</p><small>${item.date} · ${item.status}</small></div><button class="arrow" data-item="${item.id}" aria-label="View item">↗</button></article>`,
        )
        .join("")
    : '<div class="empty-state"><strong>No reports yet</strong><span>Use “Report an item” to add the first campus record.</span></div>';
}

function openModal(id) {
  document.querySelector(`#${id}`).hidden = false;
  document.body.classList.add("modal-open");
}
function closeModal(element) {
  element.closest(".modal-backdrop").hidden = true;
  document.body.classList.remove("modal-open");
}
function setAuthView(view) {
  const signIn = view === "signin";
  document.querySelector("#auth-title").textContent = signIn
    ? "Choose a workspace"
    : "Create your account";
  document.querySelector("#auth-intro").textContent = signIn
    ? "Select a workspace, then enter your account credentials."
    : "Create a campus account to report items and track your claims.";
  document.querySelector("#signin-form").hidden = true;
  document.querySelector("#signup-form").hidden = signIn;
  document.querySelector("#role-picker").hidden = !signIn;
  document.querySelector("#auth-error").hidden = true;
  document.querySelector(".auth-tabs").hidden = false;
  document
    .querySelectorAll(".auth-tab")
    .forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.authView === view),
    );
}
function showCredentialForm(role) {
  state.selectedRole = role;
  const roleName =
    role === "admin"
      ? "Administrator"
      : role === "staff"
        ? "Staff / Verifier"
        : "Student / Client";
  document.querySelector("#auth-title").textContent = `${roleName} sign in`;
  document.querySelector("#auth-intro").textContent =
    "Enter the credentials for this workspace.";
  document.querySelector("#role-picker").hidden = true;
  document.querySelector("#signin-form").hidden = false;
  document.querySelector("#signup-form").hidden = true;
  document.querySelector("#auth-error").hidden = true;
  document.querySelector('#signin-form input[name="email"]').focus();
}
function showRolePicker(user) {
  state.user = user;
  localStorage.setItem("campusUser", JSON.stringify(user));
  document.querySelector("#auth-title").textContent =
    `Hi, ${user.name.split(" ")[0]}`;
  document.querySelector("#auth-intro").textContent =
    "Your demo account is ready. Choose a workspace to continue.";
  document.querySelector("#signin-form").hidden = true;
  document.querySelector("#signup-form").hidden = true;
  document.querySelector(".auth-tabs").hidden = true;
  document.querySelector("#role-picker").hidden = false;
}
function updateAuthButton() {
  authButton.textContent = state.user
    ? `Hi, ${state.user.name.split(" ")[0]}`
    : "Sign in";
  authButton.title = state.user
    ? "Open account menu"
    : "Sign in or create an account";
}
function showDetail(item) {
  const photo = item.image
    ? `<img class="detail-photo" src="${item.image}" alt="${item.title}">`
    : '<div class="detail-photo-placeholder">No item photo added</div>';
  const proof =
    item.type === "found" && item.proofImage
      ? `<div class="proof-block"><span class="eyebrow">FINDER PROOF PHOTO</span><img class="proof-photo" src="${item.proofImage}" alt="Proof for found item"></div>`
      : "";
  const personLabel = item.type === "found" ? "Found by" : "Lost by";
  const map = `<div class="detail-map"><img src="/assets/images/campus-map.jpg" alt="Campus map showing estimated location"><span class="detail-map-pin" style="left:${item.mapX}%;top:${item.mapY}%">●</span></div>`;
  const claimAction =
    item.type === "found"
      ? `<p class="detail-note">A verifier must confirm the ownership proof first. Once approved, the student can claim this item at CSA.</p><button class="primary full" data-claim="${item.id}">Request this item</button>`
      : '<p class="detail-note">This item is marked Lost. Students and employees can report a possible match; verifiers confirm the item before release.</p>';
  document.querySelector("#detail-content").innerHTML =
    `<span class="tag ${item.type === "lost" ? "lost" : "found"}">${item.type.toUpperCase()}</span><h2>${item.title}</h2>${photo}<div class="detail-meta"><span>⌖ ${item.location}</span><span>▧ ${item.floor}</span><span>◷ Reported ${item.date.toLowerCase()}</span><span>◈ ${item.category}</span></div><p class="detail-description">${item.description}</p><p class="detail-contact"><strong>${personLabel}:</strong> ${item.personName}<br>Contact: ${item.contact}</p><div class="detail-location"><strong>Estimated location</strong>${map}</div>${proof}<div class="detail-status"><span>Current status</span><strong>${item.status}</strong></div>${claimAction}`;
  openModal("detail-modal");
}

function renderDashboard(role) {
  const pendingFound = state.items.filter(
    (item) =>
      item.type === "found" && item.status === "Found - verification pending",
  );
  const readyForCsa = state.items.filter(
    (item) => item.status === "Please claim at CSA",
  );
  const completed = state.items.filter((item) => item.status === "Complete");
  const labels = {
    student: [
      "My activity",
      "Track your reports and submitted claims.",
      [
        `${state.items.filter((item) => item.type === "lost").length} reports`,
        `${state.items.filter((item) => item.type === "found").length} found reports`,
        `${completed.length} completed`,
      ],
    ],
    staff: [
      "Verifier queue",
      "Review found reports, approve verified items, and close CSA handovers.",
      [
        `${pendingFound.length} to verify`,
        `${readyForCsa.length} at CSA`,
        `${completed.length} complete`,
      ],
    ],
    admin: [
      "System overview",
      "A controlled view of the campus lost and found operation.",
      [
        `${state.items.length} total records`,
        `${readyForCsa.length} awaiting claim`,
        `${completed.length} complete`,
      ],
    ],
  };
  const [title, intro, stats] = labels[role];
  const queue =
    role === "staff"
      ? `<div class="verification-queue"><div class="list-heading"><strong>Verification queue</strong><span>${pendingFound.length} pending</span></div>${pendingFound.length ? pendingFound.map((item) => `<div class="queue-item"><div><strong>${item.title}</strong><small>${item.location} · ${item.floor}</small></div><div class="queue-actions"><button class="queue-approve" data-verify="${item.id}">Approve</button><button class="queue-reject" data-reject="${item.id}">Reject</button></div></div>`).join("") : "<p>No found reports need verification.</p>"}</div>`
      : "";
  const csaQueue =
    role === "staff"
      ? `<div class="verification-queue"><div class="list-heading"><strong>CSA handovers</strong><span>${readyForCsa.length} ready</span></div>${readyForCsa.length ? readyForCsa.map((item) => `<div class="queue-item"><div><strong>${item.title}</strong><small>${item.personName} · ${item.contact}</small></div><button class="queue-approve" data-complete="${item.id}">Mark complete</button></div>`).join("") : "<p>No items are waiting at CSA.</p>"}</div>`
      : "";
  dashboard.innerHTML = `<div class="dashboard-inner"><div><p class="eyebrow">${role.toUpperCase()} WORKSPACE</p><h2>${title}</h2><p>${intro}</p></div><button class="dashboard-close" aria-label="Close dashboard">×</button><div class="dashboard-stats">${stats.map((stat) => `<div><strong>${stat.split(" ")[0]}</strong><span>${stat.substring(stat.indexOf(" ") + 1)}</span></div>`).join("")}</div>${queue}${csaQueue}<div class="dashboard-list"><div class="list-heading"><strong>${role === "student" ? "Recent activity" : "System activity"}</strong><span>View all ↗</span></div><p>${role === "admin" ? "Audit logs, user accounts, and category management will appear here." : role === "student" ? "Your submitted reports and claims will appear here." : "Every approval and handover is recorded for audit."}</p></div></div>`;
  dashboard.hidden = false;
  dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-open]");
  if (trigger) {
    if (trigger.dataset.open === "report-modal" && !state.user) {
      setAuthView("signin");
      document.querySelector("#auth-intro").textContent =
        "Please sign in or create a school account before reporting an item.";
      openModal("sign-in-modal");
    } else openModal(trigger.dataset.open);
  }
  const closer = event.target.closest("[data-close]");
  if (closer) closeModal(closer);
  const itemButton = event.target.closest("[data-item]");
  if (itemButton)
    showDetail(
      state.items.find((item) => item.id === Number(itemButton.dataset.item)),
    );
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    state.filter = filter.dataset.filter;
    document
      .querySelectorAll(".filter")
      .forEach((button) =>
        button.classList.toggle("active", button === filter),
      );
    renderItems(search.value);
  }
  const authView = event.target.closest("[data-auth-view]");
  if (authView) setAuthView(authView.dataset.authView);
  const backRoles = event.target.closest("[data-back-roles]");
  if (backRoles) setAuthView("signin");
  const role = event.target.closest("[data-role]");
  if (role) showCredentialForm(role.dataset.role);
  const map = event.target.closest("#campus-map");
  if (map) placeMapPin(event, map);
  if (event.target.closest(".dashboard-close")) dashboard.hidden = true;
  const claim = event.target.closest("[data-claim]");
  if (claim) {
    claim.textContent = "Claim request submitted";
    claim.disabled = true;
    claim.classList.add("submitted");
  }
  const verify = event.target.closest("[data-verify]");
  if (verify) {
    const item = state.items.find(
      (record) => record.id === Number(verify.dataset.verify),
    );
    item.status = "Please claim at CSA";
    persistItems();
    renderItems(search.value);
    renderDashboard("staff");
  }
  const reject = event.target.closest("[data-reject]");
  if (reject) {
    const item = state.items.find(
      (record) => record.id === Number(reject.dataset.reject),
    );
    item.status = "Rejected";
    persistItems();
    renderItems(search.value);
    renderDashboard("staff");
  }
  const complete = event.target.closest("[data-complete]");
  if (complete) {
    const item = state.items.find(
      (record) => record.id === Number(complete.dataset.complete),
    );
    item.status = "Complete";
    persistItems();
    renderItems(search.value);
    renderDashboard("staff");
  }
});

search.addEventListener("input", (event) => renderItems(event.target.value));
document
  .querySelector('#report-form select[name="type"]')
  .addEventListener("change", (event) => {
    const found = event.target.value === "found";
    proofPhotoField.hidden = !found;
    document.querySelector("#person-name-hint").textContent = found
      ? "person who found the item"
      : "person who lost the item";
  });
authButton.addEventListener("click", () => {
  if (state.user) {
    state.user = null;
    localStorage.removeItem("campusUser");
    updateAuthButton();
    dashboard.hidden = true;
    return;
  }
  setAuthView("signin");
  openModal("sign-in-modal");
});
document.querySelector("#signin-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const account = state.accounts.find(
    (candidate) =>
      candidate.email === data.get("email").toLowerCase() &&
      candidate.password === data.get("password") &&
      candidate.role === state.selectedRole,
  );
  if (!account) {
    const error = document.querySelector("#auth-error");
    error.textContent = "Email, password, or workspace does not match.";
    error.hidden = false;
    return;
  }
  state.user = account;
  state.role = account.role;
  localStorage.setItem("campusUser", JSON.stringify(account));
  openRolePage(account.role);
});
document.querySelector("#signup-form").addEventListener("submit", (event) => {
  event.preventDefault();
  signupError.hidden = true;
  const data = new FormData(event.currentTarget);
  const email = data.get("email").toLowerCase();
  if (!email.endsWith(".edu") && !email.endsWith(".edu.ph")) {
    signupError.textContent =
      "Please use your school email address, such as name@school.edu.ph.";
    signupError.hidden = false;
    return;
  }
  if (state.accounts.some((account) => account.email === email)) {
    setAuthView("signin");
    showCredentialForm(data.get("role"));
    const error = document.querySelector("#auth-error");
    error.textContent = "That email already has an account. Sign in instead.";
    error.hidden = false;
    return;
  }
  const account = {
    name: data.get("name"),
    email,
    password: data.get("password"),
    role: data.get("role"),
  };
  state.accounts.push(account);
  localStorage.setItem("campusAccounts", JSON.stringify(state.accounts));
  setAuthView("signin");
  showCredentialForm(account.role);
  document.querySelector("#auth-intro").textContent =
    "Account created. Sign in with the credentials you just created.";
});
function placeMapPin(event, map) {
  const bounds = map.getBoundingClientRect();
  const x = Math.max(
    2,
    Math.min(98, ((event.clientX - bounds.left) / bounds.width) * 100),
  );
  const y = Math.max(
    2,
    Math.min(98, ((event.clientY - bounds.top) / bounds.height) * 100),
  );
  const pin = document.querySelector("#map-pin");
  pin.hidden = false;
  pin.style.left = `${x}%`;
  pin.style.top = `${y}%`;
  document.querySelector("#map-x").value = x.toFixed(2);
  document.querySelector("#map-y").value = y.toFixed(2);
  document.querySelector("#pin-label").textContent =
    `Pinned at ${x.toFixed(0)}%, ${y.toFixed(0)}%`;
}
async function readImage(file) {
  return file && file.size
    ? new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })
    : "";
}
document
  .querySelector("#report-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    reportError.hidden = true;
    const data = new FormData(form);
    if (!data.get("mapX")) {
      document.querySelector("#pin-label").textContent =
        "Please click the map to place a pin.";
      return;
    }
    try {
      const image = await readImage(data.get("itemImage"));
      const proofImage =
        data.get("type") === "found"
          ? await readImage(data.get("proofImage"))
          : "";
      state.items.unshift({
        id: Date.now(),
        type: data.get("type"),
        title: data.get("title"),
        category: "Campus report",
        location: data.get("location"),
        floor: data.get("floor"),
        personName: data.get("personName"),
        contact: data.get("contact"),
        image,
        proofImage,
        mapX: data.get("mapX"),
        mapY: data.get("mapY"),
        date: data.get("date") || "Just now",
        description: data.get("description"),
        status:
          data.get("type") === "found"
            ? "Found - verification pending"
            : "Lost",
      });
      persistItems();
      form.reset();
      proofPhotoField.hidden = true;
      document.querySelector("#person-name-hint").textContent =
        "person who lost the item";
      document.querySelector("#map-pin").hidden = true;
      document.querySelector("#pin-label").textContent =
        "Click the map to place a pin";
      closeModal(form);
      renderItems(search.value);
      document.querySelector("#browse").scrollIntoView({ behavior: "smooth" });
    } catch {
      reportError.textContent =
        "The report could not be added. Please try again.";
      reportError.hidden = false;
    }
  });
document.querySelectorAll(".modal-backdrop").forEach((modal) =>
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal.querySelector(".modal-close"));
  }),
);
renderItems();
updateAuthButton();
if (new URLSearchParams(window.location.search).has("openReport")) {
  if (state.user) openModal("report-modal");
  else {
    setAuthView("signin");
    document.querySelector("#auth-intro").textContent =
      "Please sign in or create a school account before reporting an item.";
    openModal("sign-in-modal");
  }
}
