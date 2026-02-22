## Mass Assignment

When a web application takes user input and directly maps it to database fields without validating which fields are allowed, attackers can modify fields they shouldn't have access to.

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

**The Problem:** This code takes every column from the CSV and puts it directly into the `line` object — without any schema validation. The resulting object is passed straight to `setOrder()`, which does this:

```js
return {
  unitPrice,
  totalPrice,
  ...line,   // ← attacker-controlled fields overwrite computed prices
  itemId: line.itemId,
  quantity: line.quantity,
};
```

If the CSV contains a `unitPrice` or `totalPrice` column, those values override the server-computed prices via the spread.

### How Orders Are Supposed to Work

1. User submits: `itemId` and `quantity`
2. Server fetches item price from the database
3. Server calculates: `unitPrice` (from DB) and `totalPrice = unitPrice × quantity`
4. Server stores the order with the **computed** prices

---

## Is the Regular `/order/change` Endpoint Also Vulnerable?

**No.** The regular endpoint passes input through the Zod schema before calling `setOrder()`. By default, Zod's `.strip()` behavior silently removes any unrecognized fields (like `unitPrice` or `totalPrice`) from the parsed output. So even without `.strict()`, those fields never reach `setOrder()`.

The bulk CSV endpoint is vulnerable precisely because it **bypasses the schema entirely** — rows go straight to `setOrder()` with no Zod parsing at all.

---

## Fix the Vulnerability

### The Wrong Fix ❌

```js
// Blacklist approach - fragile and easy to bypass
if (key === 'unitPrice' || key === 'totalPrice') continue;
```

Why? You might forget other sensitive fields (`status`, `createdAt`, `id`), and future fields you add won't be protected automatically.

---

### The Right Fix ✅ — Validate CSV Rows Against the Schema

The codebase already has Zod schemas in `validateOrder.js`. The bulk endpoint just needs to use them. Update `orders.controller.js`:

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
      // ✅ Only pass the two expected fields into the schema.
      // Extra CSV columns never touch the parser, so they can't reach setOrder().
      const validated = OrderLineSchema.parse({
        itemId:   row.itemId,
        quantity: row.quantity,
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

**Why this works:** By explicitly constructing `{ itemId: row.itemId, quantity: row.quantity }` before passing to the schema, extra CSV columns are never included. Even if the schema didn't strip them, they never get the chance to appear in `validated`.

### Optional Improvement: Enable `.strict()` on the Schema

While not required to fix the vulnerability, enabling `.strict()` in `validateOrder.js` is good practice:

```js
export const OrderLineSchema = z.object({
  itemId:   z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(100),
}).strict();
```

Without `.strict()`, Zod silently strips unrecognized fields. With it, passing unexpected fields throws an explicit error. This makes schema violations visible and easier to debug — but the core protection above doesn't depend on it.

### Why This Approach is Best

1. **Reuses existing schemas:** Same validation logic as the `/order/change` endpoint
2. **Whitelist by design:** Only `itemId` and `quantity` are ever passed to the parser
3. **Type coercion:** `z.coerce.number()` handles string-to-number conversion safely
4. **Consistent errors:** Same error format across all endpoints
5. **Future-proof:** Schema changes automatically apply to both single and bulk uploads

---

## Test the Fix

1. Update the controller as shown above
2. Upload the exploit CSV (with `unitPrice` or `totalPrice` columns)
3. **Result:** The extra columns are ignored; prices are computed server-side as intended

---
