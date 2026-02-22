## Secure wallet transfer

There are **3 layers of defense**, applied together for full protection.

## Layer 1 — Database Constraint (Last Resort)

Add a constraint so the database physically rejects negative balances, regardless of application logic:

```sql
ALTER TABLE "Wallet" ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);
```

This is your safety net. Even if all other checks fail, the DB will throw an error and the transaction rolls back. But it's not enough alone — you still want to prevent the race at the application level.

## Layer 2 — SELECT FOR UPDATE (Row-Level Lock)

Lock the sender's row the moment you read it, forcing concurrent transactions to queue up:

```javascript
export async function transferAll({ from, to }) {
   return prisma.$transaction(async (tx) => {
      // Any concurrent transaction hitting this row will BLOCK here
      // until this transaction commits or rolls back
      const [fromWallet] = await tx.$queryRaw`
         SELECT * FROM "Wallet" WHERE code = ${from} FOR UPDATE
      `;

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

**What changes:**
```
Time │ Transaction A               │ Transaction B
─────┼─────────────────────────────┼──────────────────────────────
 t1  │ SELECT FOR UPDATE → LOCKED  │
 t2  │ balance = 100, transfer     │ SELECT FOR UPDATE → BLOCKED 🔒
 t3  │ COMMIT, lock released       │ (waiting...)
 t4  │                             │ lock acquired, reads balance = 0
 t5  │                             │ throws "doesn't have any funds" ✓
```

## Layer 3 — API Rate Limiting (Slow the Attacker Down)

Even with locking, you want to prevent a flood of requests from hammering your DB. Add rate limiting per user using `express-rate-limit`:

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from "express-rate-limit";

const transferLimiter = rateLimit({
   windowMs: 1000,   // 1 second window
   max: 1,           // max 1 transfer per second per IP
   keyGenerator: (req) => req.body.from,  // limit per wallet, not just IP
   handler: (req, res) => {
      res.status(429).json({ error: "Too many transfer requests" });
   },
});

app.post("/api/v1/wallet/withdraw", transferLimiter, transferHandler);
```

## Re-running the Attack After the Fix

```bash
printf '%s\n' {1..10} | xargs -n1 -P10 -I{} \
curl -sS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/v1/wallet/withdraw" -X POST \
-H "Accept: application/json" -H "content-type: application/json" \
--data-raw '{"from":"demo1","to":"demo"}'
```

Expected output:
```
200   ← first request wins the lock
429   ← rate limited
429
400   ← or "doesn't have any funds" if rate limiter is bypassed
400
400
...
```

And the balances:
```
demo1.balance = 0     ✓
demo.balance  = 100   ✓
```

## Summary

| Layer | Mechanism | Prevents |
|---|---|---|
| DB constraint | `CHECK (balance >= 0)` | Negative balances surviving to disk |
| Row locking | `SELECT FOR UPDATE` | Concurrent reads of stale balance |
| Rate limiting | `express-rate-limit` | Flood of parallel requests reaching DB |