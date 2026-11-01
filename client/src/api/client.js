export const tokenKey = "campusToken";

export async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = localStorage.getItem(tokenKey);
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch (error) {
    throw new Error(
      "Cannot connect to Campus Lost & Found. Check that the backend is running on the same URL.",
    );
  }

  let body = null;
  try {
    body = response.status === 204 ? null : await response.json();
  } catch (error) {
    throw new Error(
      `The server returned an invalid response (${response.status}).`,
    );
  }

  if (!response.ok) {
    if (response.status === 409) {
      throw new Error(body?.error || "That record already exists.");
    }
    if (response.status >= 500) {
      throw new Error(
        body?.error || "The server could not complete that request.",
      );
    }
    throw new Error(
      body?.error || "Please check the information and try again.",
    );
  }

  return body;
}
