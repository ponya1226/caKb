## Purpose

- Describe the user or operational problem this change solves.

## Changes

- Summarize the implementation and affected boundaries.

## Verification

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Proxy tests and build, when `server/google-vision-proxy/` changes
- [ ] Firestore Rules tests, when `firestore.rules` changes
- [ ] `git diff --check`
- [ ] Mobile-width behavior checked, when UI changes

## Risk And Operations

- [ ] No secret, credential, real receipt, or personal information is included
- [ ] External data transfer and privacy impact are unchanged or documented
- [ ] Backward compatibility and rollback method are described for data, Rules, or API changes
- [ ] ADR and project documentation are updated when the architecture or storage format changes
