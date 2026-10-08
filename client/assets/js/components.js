(() => {
  const { createElement: h, useEffect, useState } = React;
  const api = window.CampusApi.request;
  const statusNames = {
    reported: "Lost",
    under_review: "Under Review",
    found:
      "Your item has been found. Please submit a claim request to arrange collection at CSA.",
    claimed: "Your item has been claimed. This case is completed and closed.",
    completed: "Your item has been claimed. This case is completed and closed.",
    rejected: "Rejected",
  };
  const claimStatusNames = {
    pending: "Claim Pending",
    approved:
      "Your claim has been approved. Please proceed to CSA for ownership verification and item collection.",
    rejected: "Claim Rejected",
    claimed: "Claimed",
  };
  const roleNames = {
    student: "Client",
    staff: "Verifier / CSA",
    admin: "Administrator",
  };
  const campusLocations = {
    Scanlon: {
      "Ground floor": ["101c", "102c", "103c", "104c", "105c"],
      "2nd floor": ["201c", "202c", "203c", "204c", "205c"],
      "3rd floor": ["301c", "302c", "303c", "Library"],
      "4th floor": ["401c", "402c", "403c", "404c", "405c"],
      "5th floor": ["501c", "502c", "503c", "Faculty"],
    },
    "Lesage Building": {
      "Ground floor": ["Laboratory"],
      "2nd floor": [
        "201c",
        "202c",
        "203c",
        "204c",
        "205c",
        "206c",
        "207c",
        "208c",
        "209c",
        "210c",
      ],
      "3rd floor": [
        "301c",
        "302c",
        "303c",
        "304c",
        "305c",
        "306c",
        "307c",
        "308c",
        "309c",
        "310c",
      ],
      "4th floor": [
        "401c",
        "402c",
        "403c",
        "404c",
        "405c",
        "406c",
        "407c",
        "408c",
        "409c",
        "410c",
      ],
    },
    "Bates Building": {
      "Ground floor": ["007 Lab", "502B Lab", "503B Lab"],
      "2nd floor": Array.from(
        { length: 10 },
        (_, index) => `2${String(index + 1).padStart(2, "0")}B`,
      ),
      "3rd floor": Array.from(
        { length: 10 },
        (_, index) => `3${String(index + 1).padStart(2, "0")}B`,
      ),
    },
    "JHS Building": { "All floors": ["Elementary"] },
    "Barder Gym": { "All floors": ["Barder Gym"] },
    "Old Gym": { "All floors": ["Old Gym"] },
    Gates: { "All floors": ["Gate 1", "Gate 2", "Gate 3", "Gate 4"] },
    Others: { "All floors": ["Other campus area"] },
  };

  function statusText(status) {
    return statusNames[status] || status;
  }

  function claimStatusText(status) {
    return claimStatusNames[status] || status;
  }

  function Header({ user, onAuth, onLogout }) {
    return h(
      "header",
      { className: "topbar" },
      h(
        "a",
        { className: "brand", href: "/" },
        h("span", { className: "brand-mark" }, "LF"),
        "Campus Lost & Found",
      ),
      h(
        "nav",
        null,
        h("a", { href: "/" }, "Global dashboard"),
        user && h("a", { href: "/client.html#my-reports" }, "My reports"),
        user?.role === "admin" &&
          h("a", { href: "/administrator.html#workspace" }, "Administration"),
        user?.role === "staff" &&
          h("a", { href: "/verifier.html#workspace" }, "Verifier workspace"),
        user
          ? h(
              "button",
              { className: "sign-in", onClick: onLogout },
              `Sign out (${user.name.split(" ")[0]})`,
            )
          : h("button", { className: "sign-in", onClick: onAuth }, "Sign in"),
      ),
    );
  }

  function AuthModal({ mode, setMode, onClose, onSuccess, onForgot }) {
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [accountType, setAccountType] = useState("client");

    async function submit(event) {
      event.preventDefault();
      setBusy(true);
      setError("");
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const payload = { ...form, accountType };

      try {
        const result = await api(
          mode === "signup" ? "/auth/register" : "/auth/login",
          { method: "POST", body: JSON.stringify(payload) },
        );
        localStorage.setItem(window.CampusApi.tokenKey, result.token);
        onSuccess(result.user);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setBusy(false);
      }
    }

    const signUpFields =
      mode === "signup"
        ? [
            h(
              "label",
              { key: "name" },
              "Full name",
              h("input", { name: "name", required: true }),
            ),
            h(
              "label",
              { key: "accountType" },
              "Account type",
              h(
                "select",
                {
                  name: "accountType",
                  value: accountType,
                  onChange: (event) => setAccountType(event.target.value),
                },
                h("option", { value: "client" }, "Client"),
                h("option", { value: "admin" }, "Administrator"),
              ),
            ),
            accountType === "admin" &&
              h(
                "label",
                { key: "setupToken" },
                "Administrator setup authorization",
                h("input", {
                  name: "setupToken",
                  type: "password",
                  required: true,
                  autoComplete: "off",
                }),
                h(
                  "small",
                  null,
                  "Use the authorization supplied by your system administrator.",
                ),
              ),
          ]
        : [];

    signUpFields.push(
      h(
        "label",
        { key: "email" },
        "School email",
        h("input", { name: "email", type: "email", required: true }),
      ),
      h(
        "label",
        { key: "password" },
        "Password",
        h("input", {
          name: "password",
          type: "password",
          minLength: 6,
          required: true,
        }),
      ),
    );

    return h(
      "div",
      { className: "modal-backdrop" },
      h(
        "section",
        { className: "modal auth-modal" },
        h("button", { className: "modal-close", onClick: onClose }, "×"),
        h("p", { className: "eyebrow" }, "CAMPUS ACCESS"),
        h(
          "h2",
          null,
          mode === "signup" ? "Create an account" : "Sign in to continue",
        ),
        h(
          "p",
          { className: "modal-intro" },
          "Client accounts can report items and track claims. Privileged access is verified by the server.",
        ),
        h(
          "div",
          { className: "auth-tabs" },
          h(
            "button",
            {
              className: mode === "signin" ? "auth-tab active" : "auth-tab",
              onClick: () => setMode("signin"),
            },
            "Sign in",
          ),
          h(
            "button",
            {
              className: mode === "signup" ? "auth-tab active" : "auth-tab",
              onClick: () => setMode("signup"),
            },
            "Create account",
          ),
        ),
        h(
          "form",
          { className: "auth-form", onSubmit: submit },
          signUpFields,
          error && h("p", { className: "auth-error" }, error),
          h(
            "button",
            { className: "primary full", disabled: busy },
            busy
              ? "Working..."
              : mode === "signup"
                ? "Create account"
                : "Sign in",
          ),
          mode === "signin" &&
            h(
              "button",
              { className: "text-button", type: "button", onClick: onForgot },
              "Forgot password?",
            ),
        ),
      ),
    );
  }

  function ForgotPasswordModal({ onClose, onBack }) {
    const [email, setEmail] = useState("");
    const [token, setToken] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function requestReset(event) {
      event.preventDefault();
      setError("");
      try {
        const result = await api("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        setMessage(result.message);
        if (result.resetToken) setToken(result.resetToken);
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    async function resetPassword(event) {
      event.preventDefault();
      setError("");
      try {
        const result = await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        setMessage(result.message);
        setToken("");
        setPassword("");
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    return h(
      "div",
      { className: "modal-backdrop" },
      h(
        "section",
        { className: "modal auth-modal" },
        h("button", { className: "modal-close", onClick: onClose }, "×"),
        h("p", { className: "eyebrow" }, "ACCOUNT RECOVERY"),
        h("h2", null, "Forgot password"),
        h(
          "p",
          { className: "modal-intro" },
          "Request a time-limited reset token for any Client, Verifier, or Administrator account.",
        ),
        h(
          "form",
          { className: "auth-form", onSubmit: requestReset },
          h(
            "label",
            null,
            "Account email",
            h("input", {
              type: "email",
              value: email,
              onChange: (event) => setEmail(event.target.value),
              required: true,
            }),
          ),
          h("button", { className: "primary full" }, "Request reset"),
        ),
        message && h("p", { className: "auth-note" }, message),
        token &&
          h(
            "form",
            { className: "auth-form reset-form", onSubmit: resetPassword },
            h(
              "label",
              null,
              "Reset token",
              h("input", {
                value: token,
                onChange: (event) => setToken(event.target.value),
                required: true,
              }),
            ),
            h(
              "label",
              null,
              "New password",
              h("input", {
                type: "password",
                minLength: 6,
                value: password,
                onChange: (event) => setPassword(event.target.value),
                required: true,
              }),
            ),
            h("button", { className: "primary full" }, "Reset password"),
          ),
        error && h("p", { className: "auth-error" }, error),
        h(
          "button",
          { className: "text-button", type: "button", onClick: onBack },
          "Back to sign in",
        ),
      ),
    );
  }

  function ReportForm({ onClose, onSaved }) {
    const [error, setError] = useState("");
    const [pin, setPin] = useState(null);
    const [imagePreview, setImagePreview] = useState("");
    const [building, setBuilding] = useState("Scanlon");
    const [floor, setFloor] = useState("Ground floor");
    const [reportType, setReportType] = useState("lost");

    const floorOptions = Object.keys(campusLocations[building]);
    const roomOptions = campusLocations[building][floor] || [];

    function readImage(file) {
      if (!file || !file.size) return Promise.resolve("");
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const image = new Image();
          image.onerror = reject;
          image.onload = () => {
            const scale = Math.min(
              1,
              1280 / Math.max(image.width, image.height),
            );
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas
              .getContext("2d")
              .drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.76));
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    async function submit(event) {
      event.preventDefault();
      setError("");
      const form = event.currentTarget;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);
      try {
        if (reportType === "found" && !pin) {
          throw new Error(
            "Found reports require a map pin for the found location.",
          );
        }
        const image = await readImage(formData.get("image"));
        await api("/items", {
          method: "POST",
          body: JSON.stringify({
            ...data,
            itemType: data.type,
            dateReported: data.date,
            building: data.building,
            room: data.room,
            location: data.room || data.building,
            contactPhone: data.contact,
            isAnonymous: Boolean(formData.get("isAnonymous")),
            hidePhone: Boolean(formData.get("hidePhone")),
            mapX: pin?.x || "",
            mapY: pin?.y || "",
            image,
          }),
        });
        form.reset();
        setBuilding("Scanlon");
        setFloor("Ground floor");
        setReportType("lost");
        setPin(null);
        setImagePreview("");
        onSaved();
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    return h(
      "div",
      { className: "modal-backdrop" },
      h(
        "section",
        { className: "modal report-modal" },
        h("button", { className: "modal-close", onClick: onClose }, "×"),
        h("p", { className: "eyebrow" }, "NEW RECORD"),
        h("h2", null, "Report an item"),
        h(
          "form",
          { className: "report-form", onSubmit: submit },
          h(
            "div",
            { className: "form-row" },
            h(
              "label",
              null,
              "Report type",
              h(
                "select",
                {
                  name: "type",
                  value: reportType,
                  onChange: (event) => setReportType(event.target.value),
                },
                h("option", { value: "lost" }, "I lost something"),
                h("option", { value: "found" }, "I found something"),
              ),
            ),
            h(
              "label",
              null,
              "Date reported",
              h("input", { name: "date", type: "date", required: true }),
            ),
          ),
          h(
            "label",
            null,
            "Item title",
            h("input", { name: "title", required: true }),
          ),
          h(
            "label",
            null,
            "Category",
            h("input", {
              name: "category",
              placeholder: "e.g. Electronics, ID, clothing",
              required: true,
            }),
          ),
          reportType === "found" &&
            h(
              "label",
              null,
              "Finder's name",
              h("input", { name: "reporterName", required: true }),
            ),
          h(
            "div",
            { className: "form-row" },
            h(
              "label",
              null,
              "Building / area",
              h(
                "select",
                {
                  name: "building",
                  value: building,
                  onChange: (event) => {
                    const nextBuilding = event.target.value;
                    const nextFloor = Object.keys(
                      campusLocations[nextBuilding],
                    )[0];
                    setBuilding(nextBuilding);
                    setFloor(nextFloor);
                  },
                },
                Object.keys(campusLocations).map((name) =>
                  h("option", { key: name, value: name }, name),
                ),
              ),
            ),
            h(
              "label",
              null,
              "Floor",
              h(
                "select",
                {
                  name: "floor",
                  value: floor,
                  onChange: (event) => setFloor(event.target.value),
                },
                floorOptions.map((name) =>
                  h("option", { key: name, value: name }, name),
                ),
              ),
            ),
          ),
          h(
            "label",
            null,
            "Room / specific area",
            h(
              "select",
              { name: "room", required: true },
              roomOptions.map((name) =>
                h("option", { key: name, value: name }, name),
              ),
            ),
          ),
          h(
            "div",
            { className: "map-picker" },
            h(
              "div",
              { className: "map-picker-heading" },
              h("strong", null, "Pinpoint the campus location"),
              h(
                "span",
                null,
                pin
                  ? `Pinned at ${pin.x}%, ${pin.y}%`
                  : "Click the map to place a pin",
              ),
            ),
            h(
              "div",
              {
                className: "campus-map",
                onClick: (event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const x = Math.max(
                    2,
                    Math.min(
                      98,
                      ((event.clientX - bounds.left) / bounds.width) * 100,
                    ),
                  );
                  const y = Math.max(
                    2,
                    Math.min(
                      98,
                      ((event.clientY - bounds.top) / bounds.height) * 100,
                    ),
                  );
                  setPin({ x: x.toFixed(2), y: y.toFixed(2) });
                },
                role: "application",
                "aria-label": "Campus map. Click to place a location pin",
              },
              h("img", {
                className: "map-image",
                src: "/assets/images/campus-map.jpg",
                alt: "Campus map",
              }),
              pin &&
                h(
                  "span",
                  {
                    className: "map-pin",
                    style: { left: `${pin.x}%`, top: `${pin.y}%` },
                  },
                  "●",
                ),
            ),
          ),
          h(
            "label",
            null,
            "Contact number",
            h("input", {
              name: "contact",
              type: "tel",
              required: reportType === "found",
            }),
          ),
          h(
            "label",
            null,
            "Item photo",
            h("input", {
              name: "image",
              type: "file",
              accept: "image/*",
              required: reportType === "found",
              onChange: (event) => {
                const file = event.target.files?.[0];
                if (file) setImagePreview(URL.createObjectURL(file));
              },
            }),
            imagePreview &&
              h("img", {
                className: "report-image-preview",
                src: imagePreview,
                alt: "Selected item",
              }),
          ),
          h(
            "label",
            { className: "privacy-checkbox" },
            h("input", { name: "isAnonymous", type: "checkbox" }),
            "Remain anonymous on the public dashboard",
          ),
          h(
            "label",
            { className: "privacy-checkbox" },
            h("input", {
              name: "hidePhone",
              type: "checkbox",
              defaultChecked: true,
            }),
            "Hide my phone number from other users",
          ),
          h(
            "label",
            null,
            "Description",
            h("textarea", { name: "description", rows: 4, required: true }),
          ),
          error && h("p", { className: "form-error" }, error),
          h("button", { className: "primary full" }, "Submit report"),
        ),
      ),
    );
  }

  function ReportCard({ item, onView, onClaim, privateView = false }) {
    const displayName = privateView
      ? item.privateReporterName || item.reporterName
      : item.reporterName;
    return h(
      "article",
      { className: `report-card ${item.type}`, onClick: () => onView(item) },
      item.image
        ? h("img", {
            className: "report-card-image",
            src: item.image,
            alt: item.title,
          })
        : h(
            "div",
            { className: "report-card-placeholder" },
            item.type === "lost" ? "LOST" : "FOUND",
          ),
      h(
        "div",
        { className: "report-card-content" },
        h("span", { className: `tag ${item.type}` }, item.type.toUpperCase()),
        h("h3", null, item.title),
        h("p", { className: "report-card-description" }, item.description),
        h(
          "p",
          null,
          `${item.building ? `${item.building} · ` : ""}${item.location} · ${item.floor}`,
        ),
        h("small", null, `${item.date} · ${statusText(item.status)}`),
        displayName && h("small", null, `Reported by ${displayName}`),
        item.type === "found" &&
          item.status === "reported" &&
          h("small", { className: "review-status" }, "Pending verifier review"),
        (item.claims || []).map((claim) =>
          h(
            "small",
            { key: claim.id, className: "review-status" },
            claim.status === "approved"
              ? "Your claim has been approved. Please proceed to CSA for ownership verification and item collection."
              : claimStatusText(claim.status) +
                  (claim.rejectionReason ? ` · ${claim.rejectionReason}` : ""),
          ),
        ),
      ),
      item.type === "lost" &&
        item.status === "found" &&
        item.matchedFoundId &&
        h(
          "button",
          {
            className: "primary compact",
            onClick: (event) => {
              event.stopPropagation();
              onClaim({ ...item, id: item.matchedFoundId });
            },
          },
          "Request claim",
        ),
      h(
        "button",
        {
          className: "secondary compact",
          onClick: (event) => {
            event.stopPropagation();
            onView(item);
          },
        },
        "View details",
      ),
    );
  }

  function ItemDetailsModal({ item, onClose, onClaim, showPrivate = false }) {
    const [enlarged, setEnlarged] = useState(false);
    const [isAnonymous, setIsAnonymous] = useState(Boolean(item.isAnonymous));
    const [hidePhone, setHidePhone] = useState(item.hidePhone !== false);
    const [privacyMessage, setPrivacyMessage] = useState("");
    const displayName = showPrivate
      ? item.privateReporterName || item.reporterName
      : item.reporterName;
    const claimTargetId = item.type === "lost" ? item.matchedFoundId : item.id;
    const canClaim =
      item.status === "found" &&
      claimTargetId &&
      item.eligibleToClaim !== false;
    return h(
      "div",
      { className: "modal-backdrop" },
      h(
        "section",
        { className: "modal detail-modal" },
        h("button", { className: "modal-close", onClick: onClose }, "×"),
        h("span", { className: `tag ${item.type}` }, item.type.toUpperCase()),
        h("h2", null, item.title),
        item.image &&
          h("img", {
            className: "detail-photo clickable",
            src: item.image,
            alt: item.title,
            onClick: () => setEnlarged(true),
          }),
        h(
          "dl",
          { className: "detail-fields" },
          h("dt", null, "Category"),
          h("dd", null, item.category || "Not specified"),
          h("dt", null, "Description"),
          h("dd", null, item.description),
          h("dt", null, item.type === "lost" ? "Date lost" : "Date found"),
          h("dd", null, item.date),
          h("dt", null, "Location"),
          h(
            "dd",
            null,
            `${item.building ? `${item.building} · ` : ""}${item.location} · ${item.floor}`,
          ),
          h("dt", null, "Status"),
          h("dd", null, statusText(item.status)),
          h("dt", null, item.type === "lost" ? "Reporter" : "Finder"),
          h("dd", null, displayName || "Private"),
          showPrivate && item.contactPhone && h("dt", null, "Phone"),
          showPrivate && item.contactPhone && h("dd", null, item.contactPhone),
        ),
        showPrivate &&
          h(
            "form",
            {
              className: "privacy-form",
              onSubmit: async (event) => {
                event.preventDefault();
                try {
                  await api(`/items/${item.id}/privacy`, {
                    method: "PATCH",
                    body: JSON.stringify({ isAnonymous, hidePhone }),
                  });
                  setPrivacyMessage("Privacy preferences saved.");
                } catch (requestError) {
                  setPrivacyMessage(requestError.message);
                }
              },
            },
            h("strong", null, "Privacy preferences"),
            h(
              "label",
              { className: "privacy-checkbox" },
              h("input", {
                type: "checkbox",
                checked: isAnonymous,
                onChange: (event) => setIsAnonymous(event.target.checked),
              }),
              "Remain anonymous on the public dashboard",
            ),
            h(
              "label",
              { className: "privacy-checkbox" },
              h("input", {
                type: "checkbox",
                checked: hidePhone,
                onChange: (event) => setHidePhone(event.target.checked),
              }),
              "Hide my phone number from other users",
            ),
            h(
              "button",
              { className: "secondary compact" },
              "Save privacy preferences",
            ),
            privacyMessage &&
              h("small", { className: "review-status" }, privacyMessage),
          ),
        item.mapX !== null &&
          item.mapY !== null &&
          item.mapX !== undefined &&
          item.mapY !== undefined
          ? h(
              "div",
              { className: "detail-map" },
              h("img", {
                src: "/assets/images/campus-map.jpg",
                alt: "Reported campus location",
              }),
              h(
                "span",
                {
                  className: "detail-map-pin",
                  style: { left: `${item.mapX}%`, top: `${item.mapY}%` },
                },
                "●",
              ),
            )
          : h(
              "p",
              { className: "detail-note" },
              `Reported location: ${item.location}. No exact map pin was saved.`,
            ),
        canClaim &&
          h(
            "button",
            {
              className: "primary full",
              onClick: () => onClaim({ ...item, id: claimTargetId }),
            },
            "Request claim",
          ),
        enlarged &&
          h(
            "div",
            { className: "image-lightbox", onClick: () => setEnlarged(false) },
            h("img", { src: item.image, alt: item.title }),
          ),
      ),
    );
  }

  function ItemCard({ item, onClaim, onView }) {
    return h(
      "article",
      { className: "item-card clickable", onClick: () => onView(item) },
      item.image
        ? h("img", {
            className: "item-thumb",
            src: item.image,
            alt: item.title,
          })
        : h(
            "div",
            { className: "item-icon green" },
            item.type === "lost" ? "L" : "F",
          ),
      h(
        "div",
        { className: "item-copy" },
        h("span", { className: `tag ${item.type}` }, item.type.toUpperCase()),
        h("h3", null, item.title),
        h(
          "p",
          null,
          `${item.building ? `${item.building} · ` : ""}${item.location} · ${item.floor}`,
        ),
        h("small", null, `${item.date} · ${statusText(item.status)}`),
      ),
      item.type === "found" &&
        item.eligibleToClaim !== false &&
        !["claimed", "completed"].includes(item.status) &&
        h(
          "button",
          {
            className: "secondary compact",
            onClick: (event) => {
              event.stopPropagation();
              onClaim(item);
            },
          },
          "Request this item",
        ),
      h(
        "button",
        {
          className: "secondary compact",
          onClick: (event) => {
            event.stopPropagation();
            onView(item);
          },
        },
        "View details",
      ),
    );
  }

  function AdminAccountForm() {
    const [message, setMessage] = useState("");

    async function submit(event) {
      event.preventDefault();
      setMessage("");
      const form = event.currentTarget;
      try {
        await api("/admin/accounts", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        form.reset();
        setMessage("Verifier / CSA account created.");
      } catch (requestError) {
        setMessage(requestError.message);
      }
    }

    return h(
      "section",
      { className: "panel admin-account" },
      h("h3", null, "Create Verifier / CSA account"),
      h(
        "form",
        { className: "review-form", onSubmit: submit },
        h("input", { name: "name", placeholder: "Full name", required: true }),
        h("input", {
          name: "email",
          type: "email",
          placeholder: "School email",
          required: true,
        }),
        h("input", {
          name: "password",
          type: "password",
          minLength: 6,
          placeholder: "Temporary password",
          required: true,
        }),
        h("input", { type: "hidden", name: "role", value: "staff" }),
        h("button", { className: "primary" }, "Create account"),
      ),
      message && h("p", { className: "auth-note" }, message),
    );
  }

  function AdminManagement() {
    const [users, setUsers] = useState([]);
    const [items, setItems] = useState([]);
    const [message, setMessage] = useState("");

    async function refresh() {
      try {
        const [nextUsers, nextItems] = await Promise.all([
          api("/admin/users"),
          api("/admin/items"),
        ]);
        setUsers(nextUsers);
        setItems(nextItems);
      } catch (requestError) {
        setMessage(requestError.message);
      }
    }

    useEffect(() => {
      refresh();
    }, []);

    async function removeUser(user) {
      if (!window.confirm(`Remove verifier account ${user.name}?`)) return;
      try {
        await api(`/admin/users/${user.id}`, { method: "DELETE" });
        setMessage(`${user.name} was removed.`);
        refresh();
      } catch (requestError) {
        setMessage(requestError.message);
      }
    }

    async function removeItem(item) {
      if (!window.confirm(`Remove report ${item.title}?`)) return;
      try {
        await api(`/admin/items/${item.id}`, { method: "DELETE" });
        setMessage(`${item.title} was removed.`);
        refresh();
      } catch (requestError) {
        setMessage(requestError.message);
      }
    }

    return h(
      "section",
      { className: "admin-management" },
      h("h3", null, "System management"),
      message && h("p", { className: "form-error" }, message),
      h(
        "div",
        { className: "management-columns" },
        h(
          "div",
          null,
          h("h4", null, "Verifier accounts"),
          users
            .filter((user) => user.role === "staff")
            .map((user) =>
              h(
                "div",
                { className: "management-row", key: user.id },
                h("span", null, `${user.name} · ${user.email}`),
                h(
                  "button",
                  {
                    className: "danger compact",
                    onClick: () => removeUser(user),
                  },
                  "Remove",
                ),
              ),
            ),
        ),
        h(
          "div",
          null,
          h("h4", null, "Reports"),
          items.map((item) =>
            h(
              "div",
              { className: "management-row", key: item.id },
              h("span", null, `${item.title} · ${statusText(item.status)}`),
              h(
                "button",
                {
                  className: "danger compact",
                  onClick: () => removeItem(item),
                },
                "Remove",
              ),
            ),
          ),
        ),
      ),
    );
  }

  function ReviewWorkspace({ user, onChanged }) {
    const [queue, setQueue] = useState({
      items: [],
      lost: [],
      claims: [],
      cases: [],
    });
    const [selected, setSelected] = useState(null);
    const [selectedLost, setSelectedLost] = useState(null);
    const [error, setError] = useState("");

    async function refresh() {
      try {
        setQueue(await api("/review/queue"));
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    useEffect(() => {
      refresh();
    }, []);

    async function match(event) {
      event.preventDefault();
      try {
        await api(`/reports/${selected.id}/match`, {
          method: "POST",
          body: JSON.stringify(
            Object.fromEntries(new FormData(event.currentTarget)),
          ),
        });
        setSelected(null);
        refresh();
        onChanged();
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    async function decide(claimId, decision) {
      const reason =
        decision === "rejected"
          ? window.prompt("Reason for rejection") || "No reason provided"
          : "";
      try {
        await api(`/claims/${claimId}/decision`, {
          method: "POST",
          body: JSON.stringify({ decision, reason }),
        });
        refresh();
        onChanged();
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    async function collect(claimId) {
      try {
        await api(`/claims/${claimId}/collect`, { method: "POST" });
        refresh();
        onChanged();
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    async function markUnderReview(itemId) {
      try {
        await api(`/reports/${itemId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "under_review" }),
        });
        refresh();
        onChanged();
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    async function reviewSelectedMatch(status) {
      if (!selectedLost) return;
      try {
        await api(`/reports/${selected.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status,
            lostId: selectedLost.id,
          }),
        });
        setSelected(null);
        setSelectedLost(null);
        refresh();
        onChanged();
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    const comparisonRows = queue.items.map((item) =>
      h(
        "article",
        { className: "review-row", key: item.id },
        h(
          "div",
          null,
          h("strong", null, item.title),
          h(
            "small",
            null,
            `${item.building ? `${item.building} · ` : ""}${item.location} · ${item.date}`,
          ),
        ),
        h(
          "span",
          { className: "review-actions" },
          h(
            "button",
            {
              className: "secondary compact",
              onClick: () => {
                setSelected(item);
                setSelectedLost(null);
              },
            },
            "Open comparison",
          ),
          item.status === "reported" &&
            h(
              "button",
              {
                className: "secondary compact",
                onClick: () => markUnderReview(item.id),
              },
              "Mark Under review",
            ),
        ),
      ),
    );
    const claimRows = queue.claims.map((claim) =>
      h(
        "article",
        { className: "review-row", key: claim.id },
        h(
          "div",
          null,
          h("strong", null, `Claim #${claim.id}`),
          h(
            "small",
            null,
            `${claim.claimant} · ${claimStatusText(claim.status)}`,
          ),
          claim.finderPhone &&
            h("small", null, `Finder phone: ${claim.finderPhone}`),
          claim.rejectionReason && h("small", null, claim.rejectionReason),
        ),
        claim.status === "pending"
          ? h(
              "span",
              { className: "review-actions" },
              h(
                "button",
                {
                  className: "primary compact",
                  onClick: () => decide(claim.id, "approved"),
                },
                "Approve claim",
              ),
              h(
                "button",
                {
                  className: "danger compact",
                  onClick: () => decide(claim.id, "rejected"),
                },
                "Reject claim",
              ),
            )
          : claim.status === "approved" &&
              h(
                "button",
                {
                  className: "primary compact",
                  onClick: () => collect(claim.id),
                },
                "Mark as Complete and Close Case",
              ),
      ),
    );
    const caseRows = queue.cases.map((caseItem) =>
      h(
        "article",
        { className: "review-row", key: `case-${caseItem.id}` },
        h(
          "div",
          null,
          h("strong", null, caseItem.title),
          h(
            "small",
            null,
            `${caseItem.type.toUpperCase()} · ${statusText(caseItem.status)}`,
          ),
          caseItem.foundLocation &&
            h("small", null, `Found at ${caseItem.foundLocation}`),
        ),
        h("span", { className: "status" }, statusText(caseItem.status)),
      ),
    );

    function comparisonPanel(report, label, type) {
      return h(
        "div",
        { className: `comparison-side ${type}` },
        h("span", { className: `tag ${type}` }, label),
        report
          ? [
              report.image
                ? h("img", {
                    className: "comparison-photo",
                    src: report.image,
                    alt: report.title,
                    key: "image",
                  })
                : h(
                    "div",
                    {
                      className: "comparison-photo placeholder",
                      key: "placeholder",
                    },
                    "No image attached",
                  ),
              h("h3", { key: "title" }, report.title),
              h(
                "p",
                { key: "category" },
                `Category: ${report.category || "Not specified"}`,
              ),
              h("p", { key: "description" }, report.description),
              h(
                "p",
                { key: "date" },
                `${type === "lost" ? "Date lost" : "Date found"}: ${report.date}`,
              ),
              h(
                "p",
                { key: "location" },
                `${report.building ? `${report.building} · ` : ""}${report.location} · ${report.floor}`,
              ),
              h(
                "p",
                { key: "person" },
                `${type === "lost" ? "Reporter" : "Finder"}: ${report.privateReporterName || report.reporterName || "Not provided"}`,
              ),
              report.contactPhone &&
                h("p", { key: "phone" }, `Phone: ${report.contactPhone}`),
              report.mapX !== null &&
                report.mapY !== null &&
                report.mapX !== undefined &&
                report.mapY !== undefined &&
                h(
                  "div",
                  { className: "comparison-map", key: "map" },
                  h("img", {
                    src: "/assets/images/campus-map.jpg",
                    alt: `${label} reported location`,
                  }),
                  h(
                    "span",
                    {
                      className: "detail-map-pin",
                      style: {
                        left: `${report.mapX}%`,
                        top: `${report.mapY}%`,
                      },
                    },
                    "●",
                  ),
                ),
            ]
          : h(
              "p",
              { className: "comparison-empty" },
              "Select a lost report to compare.",
            ),
      );
    }

    const modal = selected
      ? h(
          "div",
          { className: "modal-backdrop" },
          h(
            "section",
            { className: "modal compare-modal" },
            h(
              "button",
              { className: "modal-close", onClick: () => setSelected(null) },
              "×",
            ),
            h("p", { className: "eyebrow" }, "CASE REVIEW"),
            h("h2", null, "Compare reports"),
            h(
              "div",
              { className: "comparison-columns" },
              comparisonPanel(selectedLost, "LOST REPORT", "lost"),
              comparisonPanel(selected, "FOUND SUBMISSION", "found"),
            ),
            h(
              "form",
              { className: "review-form", onSubmit: match },
              h(
                "label",
                null,
                "Matching lost report",
                h(
                  "select",
                  {
                    name: "lostId",
                    required: true,
                    value: selectedLost?.id || "",
                    onChange: (event) =>
                      setSelectedLost(
                        queue.lost.find(
                          (lost) => String(lost.id) === event.target.value,
                        ) || null,
                      ),
                  },
                  h("option", { value: "" }, "Select a report"),
                  queue.lost.map((lost) =>
                    h(
                      "option",
                      { key: lost.id, value: lost.id },
                      `${lost.title} (#${lost.id})`,
                    ),
                  ),
                ),
              ),
              selectedLost &&
                h(
                  "div",
                  { className: "review-actions" },
                  h(
                    "button",
                    {
                      type: "button",
                      className: "secondary compact",
                      onClick: () => reviewSelectedMatch("under_review"),
                    },
                    "Mark lost report Under review",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "danger compact",
                      onClick: () => reviewSelectedMatch("reported"),
                    },
                    "Reject proposed match",
                  ),
                ),
              h(
                "label",
                null,
                "Verified finder name",
                h("input", { name: "finderName", required: true }),
              ),
              h(
                "label",
                null,
                "Where was it found?",
                h("input", { name: "foundLocation", required: true }),
              ),
              h(
                "label",
                null,
                "Verifier notes",
                h("textarea", { name: "notes", rows: 3, required: true }),
              ),
              h(
                "button",
                { className: "primary full" },
                "Confirm match and publish CSA claim",
              ),
            ),
          ),
        )
      : null;

    return h(
      "section",
      { id: "workspace", className: "workspace-band" },
      h(
        "p",
        { className: "eyebrow" },
        `${roleNames[user.role].toUpperCase()} WORKSPACE`,
      ),
      h(
        "h2",
        null,
        user.role === "admin"
          ? "Administrator dashboard"
          : "Verifier dashboard",
      ),
      error && h("p", { className: "form-error" }, error),
      h(
        "div",
        { className: "review-grid" },
        h(
          "section",
          { className: "panel" },
          h("h3", null, "Compare reports"),
          comparisonRows.length
            ? comparisonRows
            : h("p", null, "No found reports need review."),
        ),
        h(
          "section",
          { className: "panel" },
          h("h3", null, "Claim review and collection"),
          claimRows,
        ),
      ),
      h(
        "section",
        { className: "panel resolved-cases" },
        h("h3", null, "Resolved cases"),
        caseRows.length ? caseRows : h("p", null, "No matched cases yet."),
      ),
      user.role === "admin" && h(AdminAccountForm),
      user.role === "admin" && h(AdminManagement),
      modal,
    );
  }

  window.CampusComponents = {
    AuthModal,
    ForgotPasswordModal,
    Header,
    ItemCard,
    ReportForm,
    ReviewWorkspace,
    ReportCard,
    ItemDetailsModal,
    roleNames,
    statusText,
  };
})();
