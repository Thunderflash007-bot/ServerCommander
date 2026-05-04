# Security Policy

## Supported Versions

Security updates are currently provided for the latest stable release branch. As the project is in its initial phase, support focuses on the current 1.0.x version.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | ✅ Yes             |
| < 1.0.0 | ❌ No              |

## Reporting a Vulnerability

The security of ServerCommander OS is our highest priority. If you discover a security vulnerability, we request that you do not report it via public issues to minimize the risk to other users.

### How to report:

1. **Private Reporting:** Please use the "Report a vulnerability" button under the **Security** tab of this repository on GitHub. Alternatively, you can send a detailed description to [YOUR-EMAIL-ADDRESS].
2. **Details:** Where possible, please include:
    - The type of vulnerability (e.g., RBAC bypass, SQL injection, XSS).
    - Steps to reproduce the issue.
    - Potential impact on the system or data.
3. **Response Time:** We aim to acknowledge receipt of your report within 48 hours and will keep you updated on the progress of the fix.

### Disclosure Policy

We follow the principle of "Responsible Disclosure." We ask that you keep information about the vulnerability confidential until we have provided a fix and given users time to update. In return, we will (if desired) credit you in the release notes for your contribution to the project's security.

---

**Note:** This project manages privileged access to Docker. Misconfiguration of the `.env` file or host filesystem permissions can compromise the system. Please adhere to the security guidelines provided in the README.
