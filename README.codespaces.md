## GitHub Codespaces Setup

### Goal

Run the entire lab **without any local dependencies**.

### Prerequisites

* GitHub account
* Browser

### Quick Start

1. Open the repository on GitHub
2. **Code → Codespaces → Create codespace**
3. Wait for setup to complete
4. Run:

   ```bash
   npm start
   ```
5. Open forwarded **port 3000**

### Accessing the App

* Open **PORTS** tab
* Ensure port **3000** is **Public**
* Click the 🌐 icon to open the app in the browser
* Enter Wallet code "demo" and click "connect"

Pay attention: you get a unique address from GitHub Codespaces that includes the port.

### Common Issue: 502 Error

**Cause**: App bound to `localhost`

**Fix**:

* Server must listen on:

  ```js
  app.listen(PORT, '0.0.0.0')
  ```

### Environment

* Uses `.env.codespaces`
* Database host is `db:5432`
* App and DB run in the same Docker network

### Database Operations

#### Connect

```bash
psql -h db -U postgres -d nodeapi
```
#### Using Prisma studio
```
npx prisma studio
```


### Manual Recovery (if setup fails)


```bash
bash .devcontainer/setup.sh
npm start
```

### What You Should NOT Do in Codespaces

* Do not edit `.env` manually unless instructed
* Do not expose DB ports
* Do not run Postgres outside Docker

---

