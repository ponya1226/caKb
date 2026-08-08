# Security Policy

## Reporting A Vulnerability

Do not open a public issue for a suspected vulnerability or exposed credential.

Use the repository's **Security** tab and **Report a vulnerability** to submit a private report. Include the affected component, reproduction steps, expected impact, and any temporary mitigation. Do not include real receipt images, expense data, authentication tokens, or service account credentials.

If a credential may have been exposed, revoke or rotate it before investigating the application change.

## Supported Version

caKb is continuously deployed from the protected `main` branch. Only the version currently deployed to Firebase Hosting and the active Cloud Run revision are supported.

## Response Priorities

- Critical credential exposure or unauthorized household access: contain immediately and suspend the affected integration if necessary.
- High-impact authentication, authorization, or data-loss issue: prioritize a fix and rollback plan before feature work.
- Other reports: reproduce, assess privacy impact, and schedule with regression coverage.
