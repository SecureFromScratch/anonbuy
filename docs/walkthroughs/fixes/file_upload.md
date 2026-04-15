## Secure File Upload 

The bulk upload feature has multiple security issues that allow attackers to upload and serve malicious HTML/JavaScript files, leading to credential theft and XSS attacks.

**Vulnerabilities:**
1. ❌ No file type validation
2. ❌ Uploads served from main domain
3. ❌ Files render instead of download
4. ❌ Predictable file paths

---

### Understanding the Attack

Before fixing, understand what the attacker did:

1. Uploaded `phishing.html` (fake login page)
2. Uploaded `steal.js` (credential stealer)
3. Both files served from `/uploads/` on your domain
4. CSP allows scripts from same origin (`'self'`)
5. Admin visits link → credentials stolen

**Key insight:** Even with CSP, serving user uploads from your main domain is dangerous.

---

### Fix #1: Validate File Types (Essential)

#### The Problem

Current code accepts ANY file type:

```js
// src/api/orders/bulk-orders-server.js
const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {    
    cb(null, file.originalname);
  }
});

export const upload = multer({
      storage  
});
```

### The Fix

**Add strict file type validation with content inspection, but keep disk storage so the rest of the bulk-order flow still works:**

```js
// src/api/orders/bulk-orders-server.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';

const FORBIDDEN_SIGNATURES = {
  html: [
    Buffer.from([0x3C, 0x21, 0x44, 0x4F, 0x43, 0x54, 0x59, 0x50, 0x45]),
    Buffer.from([0x3C, 0x68, 0x74, 0x6D, 0x6C]),
    Buffer.from([0x3C, 0x48, 0x54, 0x4D, 0x4C]),
  ],
  script: [
    Buffer.from([0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]),
  ],
  exe: [
    Buffer.from([0x4D, 0x5A]),
    Buffer.from([0x7F, 0x45, 0x4C, 0x46]),
  ],
  php: [
    Buffer.from([0x3C, 0x3F, 0x70, 0x68, 0x70]),
  ],
};

function checkMagicBytes(buffer) {
  for (const [type, signatures] of Object.entries(FORBIDDEN_SIGNATURES)) {
    for (const signature of signatures) {
      if (buffer.slice(0, signature.length).equals(signature)) {
        return { malicious: true, type };
      }
    }
  }

  try {
    const rows = parse(buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
      relax_quotes: false,
      max_record_size: 100000,
    });

    if (rows.length < 1) {
      return { malicious: true, type: 'empty-csv' };
    }

    const requiredColumns = ['walletCode', 'itemId', 'quantity'];
    const headers = Object.keys(rows[0] || {});
    const missing = requiredColumns.filter(c => !headers.includes(c));

    if (missing.length > 0) {
      return { malicious: true, type: `missing-columns-${missing.join('-')}` };
    }

    const csvText = buffer.toString('utf8');
    const suspicious = ['<script', 'eval(', '<?php', 'document.cookie'];

    for (const pattern of suspicious) {
      if (csvText.toLowerCase().includes(pattern.toLowerCase())) {
        return { malicious: true, type: `suspicious-${pattern}` };
      }
    }

    return { malicious: false };
  } catch (err) {
    return { malicious: true, type: 'csv-parse-error' };
  }
}

const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.csv`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext !== '.csv') {
      return cb(new Error('Only CSV files allowed'));
    }

    cb(null, true);
  }
});

export function validateFileContent(req, res, next) {
  if (!req.file) {
    return next();
  }

  try {
    const buffer = fs.readFileSync(req.file.path);
    const check = checkMagicBytes(buffer);

    if (check.malicious) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: `Malicious file detected: ${check.type}`,
        message: 'File content does not match CSV format'
      });
    }

    return next();
  } catch (err) {
    try {
      if (req.file?.path) {
        fs.unlinkSync(req.file.path);
      }
    } catch {}

    return res.status(400).json({ error: 'File validation failed' });
  }
}
```

**In your route:**

```js
import { upload,  validateFileContent } from "./bulk-orders-server.js";

router.post('/bulk',
  upload.single('file'),
  validateFileContent,
  asyncHandler(bulkOrders)
);
```

**Why this works:**
- ✅ Checks actual file content for known malicious signatures
- ✅ Parses the CSV to make sure the structure is valid
- ✅ Checks for required columns
- ✅ Scans for suspicious patterns in the file body
- ✅ Randomizes stored filenames instead of trusting `file.originalname`
- ✅ Preserves `req.file.path`, so the existing bulk-order code keeps working

**Why we keep disk storage here:**

This lab's bulk import path still reads the file from `req.file.path`. If we switch to `multer.memoryStorage()`, the file upload vulnerability may be fixed, but the bulk import endpoint will fail before it reaches the mass-assignment behavior. That would make the second lab appear fixed when it is really just broken.

So in this walkthrough we fix unrestricted file upload **without changing the contract used by the bulk-order flow**. We still validate the extension, inspect the actual content, delete malicious uploads, and randomize filenames, but we keep the upload available on disk for the rest of the code.

**Test it:**
```bash
# Rename phishing.html to orders.csv
mv phishing.html orders.csv

# Try to upload - should be rejected
curl -F 'file=@orders.csv' http://localhost:3000/api/v1/order/bulk
# Response: "Malicious file detected: html"

# Create CSV with malicious content
echo "walletCode,itemId,quantity
abc,1,2
<script>alert('xss')</script>,3,4" > malicious.csv

# Try to upload - should be rejected
curl -F 'file=@malicious.csv' http://localhost:3000/api/v1/order/bulk
# Response: "Malicious file detected: suspicious-<script"
```

---

## Fix #2: Force Download (Defense in Depth)

Even if an attacker bypasses validation, prevent files from rendering in the browser.

### The Problem

Files render as HTML/JS in the browser:

```js
// ❌ Files execute in browser
app.use('/uploads', express.static('uploads'));
```

### The Fix

**Force all uploads to download instead of render:**

```js
app.use('/uploads', (req, res, next) => {
  // Force download for all files
  res.setHeader('Content-Disposition', 'attachment');
  
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  next();
}, express.static('uploads'));
```

**Why this works:**
- ✅ `Content-Disposition: attachment` forces download
- ✅ Files never render in browser
- ✅ Even if validation bypassed, no execution
- ✅ `X-Content-Type-Options` prevents MIME confusion

**Test it:**
```bash
# Visit http://localhost:3000/uploads/test.html
# Should download the file instead of rendering it
```

---

## Fix #3: Serve Uploads from Separate Domain (Best Practice)

The most secure approach: uploads on a different domain.

### The Problem

Uploads on same domain (`yoursite.com/uploads/`) bypass CSP:

```js
// CSP allows scripts from 'self'
"script-src 'self'"

// Attacker's script is at yoursite.com/uploads/steal.js
// CSP allows it because it's from 'self'
```

### The Fix

**Option A - Subdomain (Recommended):**

```js
// In production, serve uploads from: uploads.yoursite.com
// This is a DIFFERENT origin from yoursite.com

// Use a CDN or separate storage bucket:
// - AWS S3 with CloudFront
// - Google Cloud Storage
// - Azure Blob Storage

// In your app, store only the filename:
const uploadedFile = {
  filename: 'abc123.csv',
  url: `https://uploads.yoursite.com/${filename}`
};

// CSP on main site:
"script-src 'self'"  // uploads.yoursite.com is NOT 'self'
```

**Option B - Development/Testing:**

For local testing without a subdomain:

```js
// Serve uploads on a different port
const uploadsApp = express();
uploadsApp.use((req, res, next) => {
  res.setHeader('Content-Disposition', 'attachment');
  next();
});
uploadsApp.use(express.static('uploads'));
uploadsApp.listen(3001);

// Main app on :3000, uploads on :3001
// Different origins → CSP protects you
```

**Why this works:**
- ✅ Different origin → CSP blocks scripts
- ✅ Even if attacker uploads malicious file, it can't access main site
- ✅ Industry standard (GitHub, AWS, etc. all do this)

---

## Fix #4: Randomize Filenames (Prevent Predictability)

### The Problem

Using original filename:

```js
filename: (req, file, cb) => cb(null, file.originalname)
// Uploads: phishing.html → ./uploads/phishing.html
// Attacker knows the exact URL: /uploads/phishing.html
```

### The Fix

**Generate random, unpredictable filenames:**

```js
import crypto from 'crypto';
import path from 'path';

export const upload = multer({
  storage: multer.diskStorage({
    destination: './uploads',
    filename: (req, file, cb) => {
      // ✅ Generate random filename
      const randomName = crypto.randomBytes(16).toString('hex');
      const ext = path.extname(file.originalname).toLowerCase();
      
      // Validate extension (defense in depth)
      if (ext !== '.csv') {
        return cb(new Error('Invalid extension'));
      }
      
      cb(null, `${randomName}.csv`);
      // Result: a3f2b9c1d4e5f6g7h8i9j0k1l2m3n4o5.csv
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: /* ... same as Fix #1 ... */
});
```

**Why this works:**
- ✅ Attacker can't guess the filename
- ✅ Prevents targeting specific files
- ✅ Makes mass enumeration harder

**Test it:**
```bash
# Upload a file
curl -F 'file=@orders.csv' http://localhost:3000/api/v1/order/bulk

# Check uploads directory
ls uploads/
# Output: a3f2b9c1d4e5f6g7h8i9j0k1l2m3n4o5.csv
```

---

## Fix #5: Don't Serve Uploads Publicly (Nuclear Option)

If uploads don't need to be publicly accessible, don't serve them at all.

### The Fix

**Remove the static middleware:**

```js
// ❌ REMOVE THIS LINE
// app.use('/uploads', express.static('uploads'));

// ✅ Access files only through authenticated endpoints
app.get('/api/v1/download/:fileId', authenticate, async (req, res) => {
  const file = await db.files.findOne({ 
    id: req.params.fileId,
    userId: req.user.id  // Only owner can download
  });
  
  if (!file) return res.status(404).send('Not found');
  
  res.download(path.join('./uploads', file.filename));
});
```

**Why this works:**
- ✅ Files require authentication
- ✅ No public directory listing
- ✅ Can add access control, rate limiting, auditing

---

---

## Fix #6: Enforce File Size Limits (Prevent DoS)

### The Problem

Without size limits, attackers can:
- Upload huge files (100MB, 1GB) to exhaust memory
- DoS the server by uploading many large files simultaneously
- Fill disk space with junk files

```js
// ❌ VULNERABLE - no size limit
export const upload = multer({
  storage,
  // No limits!
});
```

**Attack scenario:**
```bash
# Upload 1GB file
dd if=/dev/zero of=huge.csv bs=1M count=1024
curl -F 'file=@huge.csv' http://localhost:3000/api/v1/order/bulk

# Or 100 concurrent uploads of 10MB each = 1GB RAM used
for i in {1..100}; do
  curl -F 'file=@10mb.csv' http://localhost:3000/api/v1/order/bulk &
done
```

Result: Server runs out of memory and crashes.

### The Fix

**Set appropriate size limits:**

```js
export const upload = multer({
  storage,
  limits: { 
    fileSize: 5 * 1024 * 1024,    // 5 MB max per file
    files: 1,                      // Only 1 file per request
    fieldSize: 1024 * 1024,        // 1 MB max for text fields
    fields: 10,                    // Max 10 form fields
  }
});
```

**Why this works:**
- ✅ Rejects files over 5 MB before processing
- ✅ Prevents memory exhaustion
- ✅ Limits concurrent resource usage

**Choosing the right size:**
- **Small CSV (thousands of rows):** 1-5 MB is plenty
- **Large CSV (millions of rows):** Consider streaming validation and background processing
- **Balance:** Large enough for legitimate use, small enough to prevent abuse

**Add rate limiting:**

```js
import rateLimit from 'express-rate-limit';

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // Max 10 uploads per IP
  message: 'Too many uploads, please try again later'
});

router.post('/bulk', uploadLimiter, upload.single('file'), ...);
```

**Test it:**
```bash
# Create file larger than limit
dd if=/dev/zero of=toobig.csv bs=1M count=10  # 10 MB

# Try to upload
curl -F 'file=@toobig.csv' http://localhost:3000/api/v1/order/bulk
# Response: "File too large"
```

---

## Complete Secure Implementation

Putting it all together:

```js
// bulk-orders-server.js
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const FORBIDDEN_SIGNATURES = {
  html: [
    Buffer.from([0x3C, 0x21, 0x44, 0x4F, 0x43, 0x54, 0x59, 0x50, 0x45]),
    Buffer.from([0x3C, 0x68, 0x74, 0x6D, 0x6C]),
  ],
  script: [Buffer.from([0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74])],
  exe: [Buffer.from([0x4D, 0x5A]), Buffer.from([0x7F, 0x45, 0x4C, 0x46])],
  php: [Buffer.from([0x3C, 0x3F, 0x70, 0x68, 0x70])],
};

function checkMagicBytes(buffer) {
  for (const [type, signatures] of Object.entries(FORBIDDEN_SIGNATURES)) {
    for (const sig of signatures) {
      if (buffer.slice(0, sig.length).equals(sig)) {
        return { malicious: true, type };
      }
    }
  }

  const text = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2 || !lines[0].includes(',')) {
    return { malicious: true, type: 'invalid-csv' };
  }

  return { malicious: false };
}

const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.csv`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Only CSV files allowed'));
    }
    cb(null, true);
  }
});

export function validateFileContent(req, res, next) {
  if (!req.file) {
    return next();
  }

  try {
    const buffer = fs.readFileSync(req.file.path);
    const check = checkMagicBytes(buffer);
    if (check.malicious) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: `Malicious file: ${check.type}`
      });
    }
    return next();
  } catch (err) {
    try {
      if (req.file?.path) {
        fs.unlinkSync(req.file.path);
      }
    } catch {}
    return res.status(400).json({ error: 'File validation failed' });
  }
}
```

```js
// orders.route.js
import { upload, validateFileContent } from './bulk-orders-server.js';

router.post('/bulk',
  upload.single('file'),
  validateFileContent,
  asyncHandler(bulkOrders)
);
```

```js
// server.js
import express from 'express';
import helmet from 'helmet';

const app = express();

// ✅ Keep strong CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'"],  // No 'unsafe-inline'
    }
  }
}));

// ✅ Force download + prevent MIME sniffing
app.use('/uploads', (req, res, next) => {
  res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static('uploads'));

// Or better: don't serve publicly at all
// Remove the /uploads route entirely
```

---

## Testing Your Fix

**1. Try to upload malicious files:**
```bash
# Should fail
curl -F 'file=@phishing.html' http://localhost:3000/api/v1/order/bulk
curl -F 'file=@steal.js' http://localhost:3000/api/v1/order/bulk
```

**2. Upload a legitimate CSV:**
```bash
# Should succeed
curl -F 'file=@orders.csv' http://localhost:3000/api/v1/order/bulk
```

**3. Try to access uploaded files:**
```bash
# If publicly served: should force download, not render
# If not publicly served: should get 404
```

**4. Check filename randomization:**
```bash
ls uploads/
# Should see random names, not original names
```

---

## Defense in Depth Summary

| Layer | Protection | Why It Matters |
|-------|------------|----------------|
| **1. Extension check** | Whitelist `.csv` only | Blocks casual attacks |
| **2. Magic bytes** | Check file signatures | Blocks renamed malicious files |
| **3. File size limits** | 5 MB max, 1 file/request | Prevents DoS via huge uploads |
| **4. Rate limiting** | 10 uploads per 15min | Prevents automated abuse |
| **5. Content-Disposition** | Force download | Even if validation bypassed, no execution |
| **6. Separate domain** | uploads.yoursite.com | CSP blocks cross-origin scripts |
| **7. Random filenames** | Crypto random names | Prevents enumeration |
| **8. No public access** | Authenticated downloads | Strongest protection |

**The principle:** Each layer should stop the attack independently. If one fails, the next catches it.

---

## Common Mistakes to Avoid

❌ **Blacklisting file types:**
```js
// Don't do this - easy to bypass
if (ext === '.exe' || ext === '.html') reject();
// What about .htm, .HTML, .exe.txt, etc.?
```

✅ **Whitelist instead:**
```js
if (ext === '.csv') accept();
// Everything else rejected by default
```

---

❌ **Only checking extension or MIME:**
```js
// Extension can be spoofed: malicious.html → malicious.csv
if (ext === '.csv') accept();

// MIME is client-controlled, trivially spoofed
if (mime === 'text/csv') accept();
```

✅ **Check magic bytes (file signature):**
```js
// Check actual file content
const check = checkMagicBytes(file.buffer);
if (!check.malicious && ext === '.csv') accept();
```

---

❌ **Trusting file.originalname:**
```js
filename: (req, file, cb) => cb(null, file.originalname)
// Path traversal: ../../etc/passwd
```

✅ **Generate your own:**
```js
filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + '.csv')
```

---

## Verification Checklist

Before considering file uploads secure:

- [ ] Extension validation (whitelist `.csv`)
- [ ] Magic byte validation (check file signatures)
- [ ] CSV structure validation (commas, multiple lines)
- [ ] **File size limits** (5 MB max, test with larger file)
- [ ] **Rate limiting** (10 uploads per 15min per IP)
- [ ] Random filenames (crypto.randomBytes)
- [ ] Force download (Content-Disposition: attachment)
- [ ] Prevent MIME sniffing (X-Content-Type-Options: nosniff)
- [ ] Separate domain OR no public access
- [ ] Strong CSP (no 'unsafe-inline')
- [ ] Virus scanning (production)
- [ ] Audit logs (who uploaded what, when)
- [ ] Disk space monitoring (prevent filling disk)

**Test your limits:**
```bash
# Test size limit
dd if=/dev/zero of=10mb.csv bs=1M count=10
curl -F 'file=@10mb.csv' http://localhost:3000/api/v1/order/bulk
# Should reject: "File too large"

# Test rate limit
for i in {1..15}; do
  curl -F 'file=@valid.csv' http://localhost:3000/api/v1/order/bulk
done
# 11th request should fail: "Too many requests"
```

---

## Additional Resources

- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Multer Security Best Practices](https://github.com/expressjs/multer#security-note)
- [Content Security Policy Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

---

## Next Challenge

Now that you've secured file uploads, tackle the next vulnerability:

[Mass Assignment Challenge →](../hacks/mass_assignment.md)