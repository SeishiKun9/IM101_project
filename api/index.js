import { app, initializeServer } from "../server/src/index.js";

let initialization;

export default async function handler(req, res) {
  const requestUrl = new URL(req.url, "http://localhost");
  const apiPath = requestUrl.searchParams.get("__api_path");
  if (apiPath !== null) {
    requestUrl.searchParams.delete("__api_path");
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${apiPath}${query ? `?${query}` : ""}`;
  }

  initialization ??= initializeServer();
  try {
    await initialization;
  } catch (error) {
    console.error("API initialization failed:", error);
    res.status(500).json({ error: "The server could not complete that request." });
    return;
  }

  app(req, res);
}
