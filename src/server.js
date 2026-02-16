import express from "express";
import app from "./app.js";
import { PORT, PUBLIC_DIR } from "./config/env.js";

console.log("Public dir at", PUBLIC_DIR)
app.use(express.static(PUBLIC_DIR))

// Bind to 0.0.0.0 for Codespaces compatibility
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`API on http://${HOST}:${PORT}`);
  console.log(`In Codespaces, use the forwarded URL from the PORTS tab`);
});