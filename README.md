# Node API + Postgres (Secure Coding Lab)

Secure coding lab: **catalog API** built with **Node.js**, **Prisma ORM**, and **PostgreSQL**.

This repository is designed for **hands-on secure coding exercises**, not as a production system.

---

## Lab Structure Overview

### Challenges

All hands-on exercises live under:

```
docs/challenges/
├── 1_Hack.md    # Vulnerable challenge descriptions│   
├── 2_Fix.md     # Secure coding tasks (what to fix)

```

* Each challenge has:

  * a **Hack** version (exploit the vulnerability)
  * a **Fix** version (secure the code)
* Students should start **only** from `hack/`

---

### Walkthroughs (Solutions)

Authoritative solutions are provided under:

```
docs/walkthroughs/
├── hacks/
│   ├── *.md    # Step-by-step exploitation walkthroughs
│
├── fixes/
│   ├── *.md    # Secure implementation explanations
```

* These folders contain **answers**
* Not meant to be read before attempting the challenge

---

## How to Use This Repository

1. Pick a challenge from `challenges/hack`
2. Exploit or analyze the vulnerable behavior
3. Implement the fix using `challenges/fix`
4. Validate your solution
5. Review the official answer in `walkthroughs/`

---

## Run Modes

This lab supports two execution modes:

* **Local Development**
  See: `README.local.md`

* **GitHub Codespaces**
  See: `README.codespaces.md`

---

## Security Notice

This repository **intentionally includes vulnerable code paths**.

Do **not**:

* deploy to production
* reuse code blindly
* assume patterns here are safe by default

---

