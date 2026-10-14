---
name: Portable package lockfiles
description: Keep externally built lockfiles portable without disabling workspace package screening.
---
For public npm dependencies, keep shared lockfiles usable outside Replit while leaving the workspace package firewall enabled.

**Why:** Package tooling can record workspace-private tarball addresses that Render cannot resolve. This is a download-location problem, not evidence that the dependency versions or integrity checks are invalid; regenerating the dependency graph can introduce unrelated runtime changes.

**How to apply:** After dependency updates, check download URLs for workspace-only hosts. For portability-only fixes, preserve versions and integrity hashes and verify the canonical registry tarballs match them. Do not bypass the firewall if it actually rejects a vulnerable package.
