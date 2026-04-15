## Mass Assignment

When a web application takes user input and directly maps it to database fields without validating which fields are allowed, attackers can modify fields they should not have access to.

## The Vulnerable Code

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

**The Problem:** This code takes every column from the CSV and puts it directly into the `line` object, without any schema validation. The resulting object is passed straight to `setOrder()`, which does this:

```js
return {
  unitPrice,
  totalPrice,
  ...line,   // attacker-controlled fields overwrite computed prices
  itemId: line.itemId,
  quantity: line.quantity,
};
```

If the CSV contains a `unitPrice` or `totalPrice` column, those values override the server-computed prices via the spread.

### How Orders Are Supposed to Work

1. User submits `itemId` and `quantity`
2. Server fetches item price from the database
3. Server calculates `unitPrice` from the database value and `totalPrice = unitPrice × quantity`
4. Server stores the order with the computed prices

---

## Is the Regular `/order/change` Endpoint Also Vulnerable?

**No.** The regular endpoint passes input through the Zod schema before calling `setOrder()`. By default, Zod strips unrecognized fields from the parsed output, so fields such as `unitPrice` or `totalPrice` never reach `setOrder()`.

The bulk CSV endpoint is vulnerable precisely because it bypasses the schema entirely. Even after the file upload is validated as a CSV, each row is still copied into an object without a welcome-list of allowed fields, and that object is then passed to `setOrder()`.

---

## Fix the Vulnerability

### The Wrong Fix ❌

```js
// Blacklist approach - fragile and easy to bypass
if (key === 'unitPrice' || key === 'totalPrice') continue;
```

Why this is wrong:
- You might forget other sensitive fields such as `status`, `createdAt`, or `id`
- Future fields you add later will not automatically be protected
- It is still a blocking-list approach instead of a welcome-list approach

---

### The Right Fix ✅ — Validate CSV Rows Against the Schema

The codebase already has Zod schemas in `validateOrder.js`. The bulk endpoint just needs to use them while preserving the existing file upload flow.

Update `orders.controller.js`:

```js
import * as svc from './orders.service.js';
import { OrderLineSchema } from './validateOrder.js';
import { parseCSV } from './bulk-orders-server.js';
import fs from 'fs';

export async function bulkOrders(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let rows;
  try {
    rows = parseCSV(fs.readFileSync(req.file.path, 'utf-8'));
  } catch (err) {
    return res.status(400).json({ error: `CSV parse error: ${err.message}` });
  }

  const orderMap = new Map();
  const validationErrors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      const validated = OrderLineSchema.parse({
        itemId: row.itemId,
        quantity: row.quantity,
      });

      const walletCode = row.walletCode?.trim();
      if (!walletCode) {
        throw new Error('Missing walletCode');
      }

      if (!orderMap.has(walletCode)) {
        orderMap.set(walletCode, []);
      }

      orderMap.get(walletCode).push(validated);
    } catch (err) {
      validationErrors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  if (validationErrors.length > 0) {
    return res.status(400).json({
      error: 'CSV validation failed',
      details: validationErrors,
    });
  }

  const results = await Promise.allSettled(
    [...orderMap.entries()].map(([walletCode, lines]) =>
      svc.setOrder({ lines, walletCode, buyerIp: req.ip })
    )
  );

  const created = results.filter((r) => r.status === 'fulfilled').length;
  const errors = results
    .map((r, i) =>
      r.status === 'rejected'
        ? { walletCode: [...orderMap.keys()][i], error: r.reason?.message }
        : null
    )
    .filter(Boolean);

  res.status(207).json({ created, errors });
}
```

**Why this works:** By explicitly constructing `{ itemId: row.itemId, quantity: row.quantity }` before passing the data into the schema, extra CSV columns never get a chance to reach `setOrder()`.

This is the important point: the file upload fix only ensures the uploaded file is a valid CSV. It does **not** decide which CSV columns are safe to trust for business logic. That is the job of schema validation.

---

### Optional Improvement: Enable `.strict()` on the Schema

While not required to fix the vulnerability, enabling `.strict()` in `validateOrder.js` is good practice:

```js
export const OrderLineSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(100),
}).strict();
```

Without `.strict()`, Zod silently strips unrecognized fields. With `.strict()`, passing unexpected fields throws an explicit error. This makes schema violations visible and easier to debug, but the core protection above does not depend on it because the bulk endpoint already constructs a safe object explicitly.

---

## Why This Approach is Best

1. Reuses existing schemas
2. Uses a welcome-list by design
3. Safely coerces string CSV values to numbers
4. Keeps validation behavior consistent with `/order/change`
5. Preserves the updated file upload fix without breaking the bulk flow

---

## Test the Fix

1. Update the controller as shown above
2. Upload the exploit CSV with extra columns such as `unitPrice` or `totalPrice`
3. Result: the upload still succeeds as a valid CSV upload, but the extra columns no longer reach `setOrder()`
4. Prices are computed server-side as intended