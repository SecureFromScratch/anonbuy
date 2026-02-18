'use strict';
/**
 * bulk-orders-server.js  —  multer config + CSV parser only
 * npm install multer csv-parse
 */
import multer    from 'multer';
import { parse } from 'csv-parse/sync';

const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {    
    cb(null, file.originalname);
  }
});

export const upload = multer({
      storage  
});

// ── CSV parser ─────────────────────────────────────────────────
export function parseCSV(buffer) {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
}