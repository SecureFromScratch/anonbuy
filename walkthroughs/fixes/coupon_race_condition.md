## Preventing a Race Condition

### Coupon Redemption

This tutorial explains how a **race condition** in coupon redemption occurs and how to fix it correctly.

The vulnerability allows the same coupon to be redeemed **multiple times** by sending concurrent requests.

---

### Vulnerable Behavior

The application attempts to ensure a coupon is redeemed only once per user by checking first and then inserting a redemption record.

Under concurrency, this logic breaks.

---

### Vulnerable Code

```js
export async function redeemCoupon({ userId, code }) {
  return prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.findFirst({ where: { code, active: true } });
    if (!coupon) throw new Error("Coupon invalid");

    const used = await tx.couponRedemption.findFirst({
      where: { userId, couponId: coupon.id }
    });
    if (used) throw new Error("Already used");

    // widen race window
    // await new Promise(r => setTimeout(r, 300));

    return tx.couponRedemption.create({
      data: { userId, couponId: coupon.id }
    });
  });
}
```

---

### Why This Is Vulnerable

This code uses a **check-then-act (TOCTOU)** pattern:

1. Check if the coupon was already redeemed.
2. Assume the result is still valid.
3. Insert a redemption record.

With multiple concurrent requests:

* All requests can pass the `used` check.
* All proceed to create a redemption.
* The coupon is redeemed multiple times.

> Wrapping this logic in a transaction does **not** prevent the race.
> The database sees multiple independent transactions.

---

### Root Cause

* **Application-level checks are not atomic**
* **Transactions do not imply mutual exclusion**
* **Timing-based logic cannot enforce uniqueness**

The database is not enforcing the “one redemption per user” rule.

---

### Security-Critical Fix: Enforce Uniqueness in the Database

The **real fix** is to make the database enforce the rule.

#### Schema Change

**File:** `prisma/schema.prisma`

```prisma
model CouponRedemption {
  id        Int  @id @default(autoincrement())
  userId    Int
  couponId  Int

  @@unique([userId, couponId]) // one redemption per user per coupon
}
```

Apply the change:

```bash
npx prisma db push
# or
npx prisma migrate dev -n enforce_unique_coupon_redemption
npx prisma generate
```

Restart the Node.js server after updating the schema.

---

### Why This Fix Works

* Database uniqueness constraints are **atomic**
* Only one insert can succeed
* All concurrent duplicates fail deterministically
* The race condition becomes impossible to exploit

> This constraint alone fully closes the vulnerability.

---

### Application Fix: Remove Racy Logic and Handle Errors Cleanly

With the constraint in place, the application logic can be simplified.

---

### Fixed Code

```js
export async function redeemCouponSafe({ userId, code }) {
  return prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.findFirst({ where: { code, active: true } });
    if (!coupon) throw new Error("Coupon invalid");

    try {
      return await tx.couponRedemption.create({
        data: { userId, couponId: coupon.id }
      });
    } catch (e) {
      // P2002 = unique constraint violation
      if (e.code === "P2002") {
        throw new Error("Already used");
      }
      throw e;
    }
  });
}
```

---

### What This Improves (But Does Not Secure by Itself)

* Removes misleading check-then-insert logic
* Reduces database round trips
* Converts a low-level DB error into a clean domain error
* Prevents leaking internal database details
* Makes the code reflect reality: **the DB decides**

> Without the database constraint, this code is still vulnerable.

---

