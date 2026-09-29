const role = document.body.dataset.role;
let items = JSON.parse(localStorage.getItem("campusItems") || "[]");
const stats = document.querySelector("#stats");
const records = document.querySelector("#records");
const queue = document.querySelector("#queue");
const handover = document.querySelector("#handover");
const count = document.querySelector("#record-count");
const save = () => localStorage.setItem("campusItems", JSON.stringify(items));
const statusClass = (status) => status.toLowerCase().replaceAll(" ", "-");
let reviewItem = null;
function esc(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}
function caseDetails(item) {
  return `<div class="case-photo">${item.image ? `<img src="${item.image}" alt="${esc(item.title)}">` : "No photo attached"}</div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><dl><dt>Reported by</dt><dd>${esc(item.personName || "Not provided")}</dd><dt>Location</dt><dd>${esc(item.location)} · ${esc(item.floor)}</dd><dt>Contact</dt><dd>${esc(item.contact || "Not provided")}</dd></dl>`;
}
function openReview(item) {
  reviewItem = item;
  const form = document.querySelector("#approve-form");
  form.reset();
  const candidates = items.filter(
    (record) =>
      record.type === "lost" && ["Lost", "Rejected"].includes(record.status),
  );
  document.querySelector("#found-case").innerHTML = caseDetails(item);
  document.querySelector("#lost-cases").innerHTML = candidates.length
    ? candidates
        .map(
          (candidate) =>
            `<label class="lost-candidate"><input type="radio" form="approve-form" name="matchedLostId" value="${esc(candidate.id)}" required><span>${caseDetails(candidate)}</span></label>`,
        )
        .join("")
    : '<p class="empty">No lost reports are available to compare.</p>';
  form.elements.foundId.value = item.id;
  form.querySelector('[type="submit"]').disabled = candidates.length === 0;
  document.querySelector("#review-modal").hidden = false;
  document.querySelector(".review-modal").scrollTop = 0;
  document.body.classList.add("review-open");
}
function closeReview() {
  document.querySelector("#review-modal").hidden = true;
  document.body.classList.remove("review-open");
  reviewItem = null;
}
function showClientDetails(item) {
  const existing = document.querySelector(".client-detail-modal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.className = "client-detail-modal";
  modal.innerHTML = `<section><button class="review-close">×</button><p class="eyebrow">REPORT DETAILS</p><h2>${esc(item.title)}</h2>${item.image ? `<img class="detail-image" src="${item.image}" alt="${esc(item.title)}">` : ""}<p>${esc(item.description || "")}</p><p><strong>Status:</strong> ${esc(item.status)}</p>${item.status === "Found" ? `<p class="match-info">Found by ${esc(item.foundBy || "verifier")} at ${esc(item.foundLocation || "CSA")}.</p><p class="detail-note">Please claim your item at CSA after verifier approval.</p>` : ""}</section>`;
  document.body.append(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest(".review-close"))
      modal.remove();
  });
}
function card(item, actions = "") {
  const matchedInfo =
    item.status === "Found"
      ? `<p class="match-info">Found by ${item.foundBy || "verifier update"} at ${item.foundLocation || "CSA"} · Please claim at CSA.</p>`
      : "";
  const clientAction =
    role === "student"
      ? `<button data-details="${item.id}">View details</button>`
      : "";
  return `<article class="record"><div class="record-main">${item.image ? `<img src="${item.image}" alt="${item.title}">` : '<div class="record-icon">◒</div>'}<div><span class="tag ${item.type}">${item.type.toUpperCase()}</span><h3>${item.title}</h3><p>${item.location} · ${item.floor}</p><small>${item.personName || "No name"} · ${item.contact || "No contact"}</small>${matchedInfo}</div></div><div class="record-side"><span class="status ${statusClass(item.status)}">${item.status}</span>${actions}${clientAction}</div></article>`;
}
function render() {
  items = JSON.parse(localStorage.getItem("campusItems") || "[]");
  const pending = items.filter(
    (item) => item.status === "Found - verification pending",
  );
  const ready = items.filter((item) => item.status === "Please claim at CSA");
  const complete = items.filter((item) => item.status === "Complete");
  const lost = items.filter((item) => item.type === "lost");
  const found = items.filter((item) => item.type === "found");
  const values =
    role === "staff"
      ? [
          [pending.length, "To verify"],
          [ready.length, "At CSA"],
          [complete.length, "Complete"],
        ]
      : role === "admin"
        ? [
            [items.length, "Total records"],
            [found.length, "Found"],
            [lost.length, "Lost"],
          ]
        : [
            [lost.length, "Lost reports"],
            [found.length, "Found reports"],
            [complete.length, "Completed"],
          ];
  stats.innerHTML = values
    .map(
      ([value, label]) =>
        `<div><strong>${value}</strong><span>${label}</span></div>`,
    )
    .join("");
  if (count)
    count.textContent = `${items.length} record${items.length === 1 ? "" : "s"}`;
  if (role === "staff") {
    queue.innerHTML = pending.length
      ? pending
          .map((item) =>
            card(
              item,
              `<button data-approve="${item.id}">Review case</button>`,
            ),
          )
          .join("")
      : '<div class="empty">No reports need verification.</div>';
    handover.innerHTML = ready.length
      ? ready
          .map((item) =>
            card(
              item,
              `<button data-complete="${item.id}">Mark complete</button>`,
            ),
          )
          .join("")
      : '<div class="empty">No items are waiting at CSA.</div>';
  } else {
    records.innerHTML = items.length
      ? items.map((item) => card(item)).join("")
      : '<div class="empty">No records yet.</div>';
  }
}
document.addEventListener("click", (event) => {
  const review = event.target.closest("[data-approve]");
  const reject = event.target.closest("[data-reject]");
  const complete = event.target.closest("[data-complete]");
  const details = event.target.closest("[data-details]");
  const itemId = Number(
    review?.dataset.approve ||
      reject?.dataset.reject ||
      complete?.dataset.complete ||
      details?.dataset.details,
  );
  const item = items.find((record) => record.id === itemId);
  if (review && item) openReview(item);
  if (details && item) showClientDetails(item);
  if (reject && item) {
    item.status = "Rejected";
    save();
    render();
  }
  if (complete && item) {
    item.status = "Complete";
    save();
    render();
  }
  if (event.target.closest("[data-close-review]")) closeReview();
  if (event.target.closest("[data-reject-case]") && reviewItem) {
    reviewItem.status = "Rejected";
    save();
    closeReview();
    render();
  }
  if (event.target.closest("[data-signout]")) {
    localStorage.removeItem("campusUser");
    location.href = "/";
  }
});
document.querySelector("#approve-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const found = items.find((item) => item.id === Number(data.get("foundId")));
  const lost = items.find(
    (item) => item.id === Number(data.get("matchedLostId")),
  );
  if (!found || !lost) {
    alert("Select a matching lost report before publishing the CSA claim.");
    return;
  }
  found.status = "Please claim at CSA";
  found.finderName = data.get("finderName");
  found.foundLocation = data.get("foundLocation");
  found.verifierNotes = data.get("notes");
  found.matchedLostId = lost.id;
  lost.status = "Found";
  lost.foundBy = data.get("finderName");
  lost.foundLocation = data.get("foundLocation");
  lost.verifierNotes = data.get("notes");
  lost.matchedFoundId = found.id;
  save();
  closeReview();
  render();
});
render();
