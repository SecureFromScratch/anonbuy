# Mass Assignment Vulnerability Lab

## Introduction

This lab demonstrates a **mass assignment vulnerability** in a bulk order upload feature. You'll exploit it to get free items, then fix it properly.

---

## Part 1: Understanding the Vulnerability

### What is Mass Assignment?

When a web application takes user input and directly maps it to database fields without validating which fields are allowed, attackers can modify fields they shouldn't have access to.

### The Vulnerable Code

Look at `orders.controller.js` in the `bulkOrders` function:

```js
// Build line object from CSV row
const line = {};
for (const [key, value] of Object.entries(row)) {
  if (key === 'walletCode') continue;
  line[key] = !isNaN(value) && value !== '' ? Number(value) : value;
}
orderMap.get(walletCode).push(line);
```

**The Problem:** This code takes EVERY column from the CSV and puts it into the `line` object. If the CSV has a column called `unitPrice` or `totalPrice`, those values go straight into the database.

### How Orders Are Supposed to Work

1. User submits: `itemId` and `quantity`
2. Server fetches item price from database
3. Server calculates: `unitPrice` (from DB) and `totalPrice = unitPrice × quantity`
4. Server stores the order with the **computed** prices

### The Exploit

If we add `unitPrice` and `totalPrice` columns to the CSV with value `0`, the vulnerable code accepts them and they **overwrite** the computed prices in the database.

---

## Part 2: Exploit the Vulnerability

### Step 1: Download the Exploit CSV

Click the **⬇ Exploit CSV** button in the Bulk Upload panel. Open it in a text editor:

```csv
walletCode,itemId,quantity,unitPrice,totalPrice
demo,1,1,0,0
demo,3,1,0,0
demo,2,5,0,0
```

Notice the extra columns: `unitPrice,totalPrice` — both set to `0`.

### Step 2: Upload the File

1. Upload the exploit CSV using the bulk upload interface
2. Check your shopping cart
3. **Result:** All items show `@ $0.00` — total is $0.00

You just got $165 worth of items for free by adding two columns to a CSV file.

---

## Part 3: Why It Works

Follow the data flow:

1. **CSV parsed:** `{ walletCode: "demo", itemId: 1, quantity: 1, unitPrice: 0, totalPrice: 0 }`
2. **Controller loops through ALL keys:**
   ```js
   line[key] = Number(value);
   // Results in: { itemId: 1, quantity: 1, unitPrice: 0, totalPrice: 0 }
   ```
3. **Sent to service:** `setOrder({ lines: [{ itemId: 1, quantity: 1, unitPrice: 0, totalPrice: 0 }], ... })`
4. **Service computes prices:**
   ```js
   const unitPrice = priceById.get(line.itemId);   // = 15 from database
   const totalPrice = unitPrice * line.quantity;   // = 15
   return {
     unitPrice,      // = 15  ← set first
     totalPrice,     // = 15
     ...line,        // ← spreads { itemId: 1, quantity: 1, unitPrice: 0, totalPrice: 0 }
   };
   // Final object: { unitPrice: 0, totalPrice: 0, itemId: 1, quantity: 1 }
   ```

The spread operator `...line` comes AFTER the computed values, so the attacker's `0` overwrites the real price.

---

## Part 4: Fix the Vulnerability

### The Wrong Fix ❌

**Don't do this:**
```js
// Blacklist approach - fragile and easy to bypass
if (key === 'unitPrice' || key === 'totalPrice') continue;
```

Why? Attackers can bypass with encoding tricks, typos the service tolerates, or future fields you forget to block.

---

### The Right Fix ✅ — Enable Schema Validation

Your codebase already has Zod schemas in `validateOrder.js`, but `.strict()` is commented out.

#### Step 1: Enable `.strict()` on the Schema

In `validateOrder.js`, uncomment `.strict()`:

```js
export const OrderLineSchema = z.object({
  itemId:   z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(100),
}).strict();  // ← UNCOMMENT THIS

export const OrderSchema = z.object({
  lines:      z.array(OrderLineSchema).min(0),
  walletCode: z.string().trim().min(1).max(256)
}).strict();  // ← UNCOMMENT THIS
```

**What `.strict()` does:**
- Without it: `{ itemId: 1, quantity: 2, unitPrice: 0 }` → passes, extra fields survive
- With it: `{ itemId: 1, quantity: 2, unitPrice: 0 }` → **throws error: "Unrecognized keys: unitPrice"**

#### Step 2: Validate CSV Rows Against the Schema

Update `orders.controller.js` in the `bulkOrders` function:

```js
import { OrderLineSchema } from './validateOrder.js';

export async function bulkOrders(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let rows;
  try { rows = parseCSV(req.file.buffer); }
  catch (err) { return res.status(400).json({ error: `CSV parse error: ${err.message}` }); }

  const orderMap = new Map();
  const validationErrors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      // ✅ Validate each row against OrderLineSchema
      // This rejects unitPrice, totalPrice, status, etc.
      const validated = OrderLineSchema.parse({
        itemId:   row.itemId,
        quantity: row.quantity,
        // Only pass these two fields to the schema
        // If CSV has extra columns, they never reach the parser
      });
      
      const walletCode = row.walletCode?.trim();
      if (!walletCode) throw new Error('Missing walletCode');
      
      if (!orderMap.has(walletCode)) orderMap.set(walletCode, []);
      orderMap.get(walletCode).push(validated);
      
    } catch (err) {
      validationErrors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  if (validationErrors.length > 0) {
    return res.status(400).json({ 
      error: 'CSV validation failed', 
      details: validationErrors 
    });
  }

  const results = await Promise.allSettled(
    [...orderMap.entries()].map(([walletCode, lines]) =>
      svc.setOrder({ lines, walletCode, buyerIp: req.ip })
    )
  );

  const created = results.filter(r => r.status === 'fulfilled').length;
  const errors = results
    .map((r, i) => r.status === 'rejected'
      ? { walletCode: [...orderMap.keys()][i], error: r.reason?.message }
      : null)
    .filter(Boolean);

  res.status(207).json({ created, errors });
}
```

### Why This Approach is Best

1. **Reuses existing schemas:** Same validation as your `/order/change` endpoint
2. **Declarative validation:** The schema says "these are the ONLY valid fields"
3. **Type coercion:** `z.coerce.number()` handles string→number conversion safely
4. **Consistent errors:** Same error format across all endpoints
5. **Future-proof:** Schema changes automatically apply to both single and bulk uploads

### Test the Fix

1. Uncomment `.strict()` in `validateOrder.js`
2. Update the controller code above
3. Upload the exploit CSV
4. **Result:** `400 Bad Request` — validation errors show which rows/fields failed

The `unitPrice` and `totalPrice` columns never make it past the schema validation.

---


### Why Was `.strict()` Commented Out?
In our case, for the purpose of learning this vulnerability.
Common reasons developers disable it:
- **"It's too strict"** — they want flexibility during development
- **"Legacy data has extra fields"** — old API clients send fields no longer used
- **"Frontend sends computed values"** — client sends both input and derived data

**The problem:** Every one of these reasons creates a mass assignment vulnerability. The fix is not to disable `.strict()`, it's to:
- Use proper API versioning for legacy clients
- Clean up the frontend to only send required fields
- Validate strictly in production, relax in dev if needed

---

## Part 5: Additional File Upload Vulnerability (Bonus)

### The Problem

Look at `bulk-orders-server.js`:

```js
export const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  
  // fileFilter is commented out - accepts ANY file type!
});
```

Without a `fileFilter`, an attacker can:
- Upload `malware.exe` renamed to `orders.csv`
- Upload `shell.php` disguised as a CSV
- Upload a 5 MB zip bomb

### The Fix

Uncomment the `fileFilter` in `bulk-orders-server.js`:

```js
fileFilter: (req, file, cb) => {
  const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
  if (ext === '.csv') cb(null, true);
  else cb(new Error(`Rejected: ${file.originalname}`), false);
}
```

Now only `.csv` files are accepted.

---

## Key Takeaways

1. **Never trust user input** — not even column names in a CSV
2. **Whitelist, don't blacklist** — explicitly name the fields you accept
3. **Server-side validation is mandatory** — client-side checks can be bypassed
4. **Validate file types** — check extension AND MIME type
5. **Principle of least privilege** — users should only control the minimum fields necessary

---

## Reflection Questions

1. What other fields might be exploitable in your app? (Hint: `status`, `createdAt`, `id`?)
2. How would you exploit this if the service used `{ ...line, unitPrice, totalPrice }` (computed values last)?
3. Why is `.strict()` on Zod schemas important? (See `validateOrder.js`)
4. Could an attacker exploit this via the normal `/order/change` endpoint? Why or why not?

---

## Additional Resources

- [OWASP: Mass Assignment](https://owasp.org/API-Security/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/)
- [CWE-915: Improperly Controlled Modification of Dynamically-Determined Object Attributes](https://cwe.mitre.org/data/definitions/915.html)