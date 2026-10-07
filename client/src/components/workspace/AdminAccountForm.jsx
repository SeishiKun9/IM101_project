import React, { useState } from "react";
import { apiRequest } from "../../api/client.js";

export default function AdminAccountForm() {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    const form = event.currentTarget;
    try {
      await apiRequest("/admin/accounts", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      setMessage("Verifier / CSA account created.");
    } catch (requestError) {
      setMessage(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel admin-account">
      <h3>Create Verifier / CSA account</h3>
      <form className="review-form" onSubmit={submit}>
        <input name="name" placeholder="Full name" required />
        <input name="email" type="email" placeholder="School email" required />
        <input
          name="password"
          type="password"
          minLength={6}
          placeholder="Temporary password"
          required
        />
        <input type="hidden" name="role" value="staff" />
        <button className="primary" disabled={submitting}>
          {submitting ? "Creating..." : "Create account"}
        </button>
      </form>
      {message && <p className="auth-note">{message}</p>}
    </section>
  );
}
