## Secure wallet transfer

There are **3 layers of defense**. Use them together for full protection.

## Layer 1 - Database constraint (last resort)

Add a database constraint so negative balances cannot be committed even if application logic fails.

1. Create a migration file:

```bash
npx prisma migrate dev --name add-wallet-balance-check --create-only
```

2. Open the generated file:

`prisma/migrations/<timestamp>_add-wallet-balance-check/migration.sql`

3. Paste this SQL into that file:

```sql
ALTER TABLE "Wallet"
ADD CONSTRAINT balance_non_negative
CHECK (balance >= 0);
```

4. Apply the migration:

```bash
npx prisma migrate dev
```

If the migration fails because existing rows already violate the constraint, first find and fix them:

```sql
SELECT id, code, balance
FROM "Wallet"
WHERE balance < 0;
```

For example:

```sql
UPDATE "Wallet"
SET balance = 0
WHERE balance < 0;
```

Then re-run the migration.

This layer is a **safety net**. It prevents invalid data from being stored, but by itself it does not prevent the race condition.

## Layer 2 - `SELECT ... FOR UPDATE` row lock

Lock the sender wallet row as soon as it is read. This forces concurrent transfers from the same wallet to wait.

```javascript
// src/api/wallet/wallet.service.js

export async function transferAll({ from, to }) {
    return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
            SELECT *
            FROM "Wallet"
            WHERE code = ${from}
            FOR UPDATE
        `;

        const fromWallet = rows[0];

        if (!fromWallet) {
            throw new BusinessError("Wallet to withdraw from not found");
        }

        const transferAmount = fromWallet.balance;

        if (transferAmount <= 0) {
            throw new BusinessError("Wallet to withdraw from doesn't have any funds");
        }

        const result = await tx.wallet.update({
            where: { code: to },
            data: { balance: { increment: transferAmount } },
        });

        await tx.wallet.update({
            where: { code: from },
            data: { balance: { decrement: transferAmount } },
        });

        return result;
    });
}
```

### What changes

Without the lock, two concurrent requests can both read the same starting balance before either one updates it.

With the lock:

```text
Time | Transaction A                    | Transaction B
-----+----------------------------------+-------------------------------
 t1  | SELECT ... FOR UPDATE -> locked  |
 t2  | reads balance = 100              | SELECT ... FOR UPDATE -> waits
 t3  | transfers funds                  | still waiting
 t4  | COMMIT                           | lock released
 t5  |                                  | lock acquired
 t6  |                                  | reads balance = 0
 t7  |                                  | throws "doesn't have any funds"
```

This is the **main race-condition fix**.

## Layer 3 - Rate limiting

Rate limiting does not fix correctness, but it reduces abuse and lowers pressure on the database.

Install:

```bash
npm install express-rate-limit
```

Example:

```javascript
// src/api/wallet/wallet.routes.js

import rateLimit from "express-rate-limit";

const transferLimiter = rateLimit({
    windowMs: 1000,
    max: 1,
    keyGenerator: (req) => {
        return req.body?.from || req.ip;
    },
    handler: (req, res) => {
        return res.status(429).json({ error: "Too many transfer requests" });
    },
});

app.post("/api/v1/wallet/withdraw", transferLimiter, transferHandler);
```

This is an additional defensive layer. It should not be relied on as the primary race-condition mitigation.

## Re-running the attack after the fix

```bash
printf '%s\n' {1..10} | xargs -n1 -P10 -I{} \
curl -sS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/v1/wallet/withdraw" -X POST \
-H "Accept: application/json" \
-H "content-type: application/json" \
--data-raw '{"from":"demo1","to":"demo"}'
```

Expected result:

```text
200
429
429
400
400
400
...
```

Possible meanings:
- `200`: the first request succeeded
- `429`: blocked by rate limiter
- `400`: request reached the handler after funds were already moved, so the wallet no longer has funds

Balances should end up as:

```text
demo1.balance = 0
demo.balance  = 100
```

## Summary

| Layer | Mechanism | Purpose |
|---|---|---|
| 1 | `CHECK (balance >= 0)` | Prevent invalid negative balances from being stored |
| 2 | `SELECT ... FOR UPDATE` | Prevent concurrent reads of the same stale balance |
| 3 | Rate limiting | Reduce abuse and lower DB pressure |

## Important notes

- Use `tx`, not `prisma`, inside the transaction callback.
- The database constraint is a safety net, not the primary concurrency fix.
- The row lock is the key fix for this race.
- Rate limiting is defense-in-depth only.
- Validate `from` and `to` before starting the transaction.
