'use strict';
/**
 * bulk-orders-server.js  —  multer config + CSV parser only
 * npm install multer csv-parse
 */
import multer    from 'multer';
import { parse } from 'csv-parse/sync';

// ── Multer ─────────────────────────────────────────────────────
export const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },

  // ❌ VULNERABLE — comment out to demo file upload vuln
  // ✅ SAFE       — whitelist by extension
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (ext === '.csv') cb(null, true);
    else cb(new Error(`Rejected: ${file.originalname}`), false);
  },
});

// ── CSV parser ─────────────────────────────────────────────────
export function parseCSV(buffer) {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
}