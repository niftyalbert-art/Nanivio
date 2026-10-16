# Historical application credential exposure

## Status and safety boundary

**Disposition: deferred at the owner's request, not remediated.** After the live
target and one candidate account were confirmed, the owner asked to leave the
affected account and move on. Stop further cohort investigation, CSV requests
and production/account actions. Do not resume without a renewed owner request.
This ends the assigned assessment at the owner's revised scope; it does not
certify that the account or historical copies have been secured.

This is an incident-response plan, not evidence that production is clean.
The owner has supplied screenshots of aggregate assessment results, summarized
below. No production cleanup, reset email, password change, session revocation,
cache purge or backup deletion has been performed in this task.
The live service is hosted on Render and uses external Supabase. The owner has
explicitly confirmed that the queried project, “Malvi nanivio upgrades”, matches
the live Render service's `SUPABASE_URL`. This does not establish that workspace
credentials point to the same target or authorize production writes.

**Only if the owner reopens the incident:** obtain the remaining aggregate
columns from the query's Results table. The earlier request to continue and
target confirmation were not specific approval for password resets, session
revocation or backup deletion. No cleanup or account actions were approved or
performed. Never send credentials, full application rows, payloads, HAR files,
recovery links or tokens.

## Owner-supplied aggregate evidence

Screenshots show the following for the live project, as separately confirmed by
the owner after privately checking Render's `SUPABASE_URL`.

| Visible aggregate | ALL | EXPERT |
| --- | --- | --- |
| Application rows | 1 | 1 |
| Distinct applicant accounts | 1 | 1 |
| Rows with password-named keys | 1 | 1 |
| Rows with nonempty password-named fields | 1 | 1 |
| Candidate password accounts | 1 | 1 |

These are two summaries of the **same one account**, not two accounts. No other
application-type rows are visible in the two-row result. The earlier guard check
returned `cleanup_guard_enabled = false` and `sanitizer_installed = false`.
Treat the account as potentially exposed without retrieving or validating the
stored value. Neither these counts nor the missing guard prove external access
or establish that the value remains a usable password.

The remaining columns are off-screen: broader sensitive-key counts, Auth mapping,
stored-session presence and candidate creation-date bounds. They remain unknown,
as do execution time, historical/deleted records and copies.
If investigation resumes, request only these aggregate columns, not payloads or
identifying rows. Do not request them while this work is deferred.

## Evidence and current unknowns

- `src/server/persistentAuth.ts` sanitizes registration application payloads and
  application responses; `src/server/applicationPrivacy.ts` filters secret keys
  and limits public directory fields. This demonstrates source containment only,
  not that Render runs that source.
- `migrations/008_application_credentials_privacy.sql` transactionally sanitizes
  historical application JSON and installs a write guard. It does **not**
  change Supabase Auth passwords, revoke sessions or erase backups/caches.
- Expert, business and driver sign-ups pass application data to persistent
  storage. Start assessment with all application types and statuses, not only
  verified profiles. Personal-only accounts are not established as affected by
  this storage path; expand if other evidence warrants it.
- Registration responses, administrator lists/review responses, and previously
  public expert/business directories are candidate historical response paths.
  Inspect route authorization and historical deployment evidence before claiming
  who could access each path. Do not reproduce the leak by requesting old bodies.
- A nonempty password-named field is a **candidate**, not proof of a current
  reusable password. Do not compare historical plaintext to login credentials.
- A clean table today cannot exclude previous exposure, prior cleanup, deleted
  applications, caches or backups. Creation dates are not exposure dates.
- The owner-confirmed live project has one current candidate password account.
  Deployment/exposure dates, access/exfiltration evidence, backup retention
  and actual cache configuration remain unknown.

## Read-only assessment

Use `scripts/incident-application-cohort.sql` only against the owner-confirmed
Supabase project, with access to the indicated tables. It recursively checks
objects/arrays inside the database, returning only counts, dates and installation
booleans. It runs in a read-only transaction with a 15-second statement timeout.
No application values or account identifiers leave the database.

The query counts password-named keys separately from broader sensitive keys,
deduplicates accounts, shows unmapped Auth accounts, and counts accounts with
stored Auth sessions. Stored sessions are not necessarily usable sessions.
Fields such as password hashes/confirmation fields can overestimate the cohort;
an empty string or JSON null is excluded from the nonempty-field count. Other
non-string values are conservatively included. Fields under unrecognized names,
other tables, deleted records, and historical-only copies are outside this query.
The broad sensitive-key predicate matches migration 008's filtering scope.

An owner should record only: project identity (non-secret), UTC execution time,
query revision, aggregate results, guard state and limitations in their restricted
incident record. Do not paste row-level evidence into this repository or chat.
If permissions or timeout prevent completion, record assessment as unavailable,
not zero; do not fall back to fetching payloads or listing all Auth users.

## Proposed approval gates and rollout order if reopened

Each gate needs explicit owner approval; approval to read does not approve writes.
The sequence below is retained as a future plan, not an instruction to execute now.

1. **Confirm scope and containment.** Owner verifies the Render source revision
   contains the response/storage fix, checks registration, administrator and
   public-directory paths, and schedules deployment through their normal release
   process. Do not deploy from this task fork. Restrict vulnerable endpoints while
   arranging containment if the fix is not live.
2. **Assess before erasure.** Run the aggregate check. Before cleanup, an approved
   operator must preserve the minimum deduplicated application-user/Auth-user
   mapping for remediation in an owner-controlled, access-restricted incident
   ledger, never in the repository. Keep identifiers only, not application JSON
   or passwords. Resolve unmatched accounts manually. Include additional
   historical candidates if deployment/audit evidence expands the cohort.
3. **Approve cleanup.** Name the exact Supabase project, migration file, change
   window and operator. Rehearse migration 008 and
   `tests/application-privacy.sql` on isolated synthetic data, not a live-data
   staging clone. Check permissions/locking and table size first. Then the owner
   applies migration 008 in its existing transaction using the approved external
   database process. Re-run the aggregate query: sensitive-key counts must be
   zero and the guard enabled. Verify ordinary fields and new safe applications
   still work. Do not restore contaminated payloads as rollback.
4. **Approve account action separately.** Agree the final cohort, notification
   text, reset policy, session strategy, timing, support owner, mail capacity,
   retry limits and expected sign-in interruption. Cleanup alone is insufficient.
5. **Approve caches/backups separately.** Use the inventory below, preserving
   necessary evidence without making new plaintext copies.

## Password reset and Supabase session strategy

- Treat genuinely stored passwords as compromised even without evidence of misuse.
  Notify approved users clearly, direct them to a trusted reset flow, advise
  changing reused passwords elsewhere, and never quote the exposed password.
  Example: “Your application record may have included your registration password.
  We are securing affected accounts. Reset your password through our usual sign-in
  page and change it anywhere else you reused it. We will never ask you to send us
  your password.” Adjust completion claims to the work actually verified.
- Verify SMTP, redirect allowlist, the real application URL, recovery completion,
  expiry and rate limits with a designated test account first.
  `auth.resetPasswordForEmail` sends a recovery email; it neither changes the old
  password nor proves recovery completed. Never log recovery links.
- An approved forced-rotation policy must invalidate the old password, not merely
  send mail. If needed, an operator may use the supported Auth admin password
  update with a unique cryptographically random, undisclosed password and send
  recovery instructions. This disrupts access and needs separate approval and a
  tested recovery path. Do not generate/store replacement passwords in this repo,
  chat or task output. Never use a common temporary password.
- Supabase's installed SDK exposes `auth.admin.signOut(userJwt, 'global')`: it
  accepts a **valid user JWT, not a user UUID or the service-role key as user
  identity**. Do not request users' tokens, impersonate them, sign in using exposed
  passwords, or invent a UUID-based sign-out endpoint. For unattended cohort
  revocation, the operator must first establish a supported per-user method with
  Supabase's current administration tools/support and verify it on a test account.
  Do not mutate managed `auth.sessions`/`auth.refresh_tokens` directly as a guess.
- A password change is security-sensitive session termination per Supabase's
  session guide, but verify actual admin-reset behavior in this project's version
  and settings; do not assume every update invalidates every existing session.
  Check inability to refresh old sessions and the count of remaining stored
  sessions through authorized aggregate checks. Never export refresh-token rows.
- Revoked sessions' existing JWTs may remain usable until expiry. Record the
  configured maximum lifetime and verification deadline. If immediate denial is
  required, approve a server-side incident hold/session-existence check for the
  cohort across all protected APIs and direct database access paths, or restrict
  access until expiry. Do not assume calling `getUser` checks session revocation.
- The current persistent `/api/auth/signout` route returns success without
  revoking Supabase sessions. Do not use that route as incident containment.
  The current recovery handler uses an admin password update; prove its session
  behavior before relying on it as forced rotation.
- Pilot with an approved test account, then bounded batches. Keep only restricted
  identifiers, action timestamps, success/failure categories and retry state in
  the operator ledger. Record partial failures; retry only failed actions.
  Verify old password rejection, recovery success, old refresh denial, access
  denial after the JWT deadline, and unaffected-account access.

References consulted: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions),
[sign-out semantics](https://supabase.com/docs/guides/auth/signout),
[admin signOut](https://supabase.com/docs/reference/javascript/auth-admin-signout),
and installed `@supabase/auth-js` admin API implementation. Verify current
provider capabilities again when executing.

## Cached responses, records and backups

| Surface | Source assessment | Owner action / evidence still required |
| --- | --- | --- |
| HTTP/browser/shared CDN caches | No explicit API `Cache-Control` middleware was found in `server.ts`; this does not prove responses were cached. | Inspect actual Render/CDN configuration and headers without capturing bodies. Approve `private, no-store` for sensitive APIs; purge affected paths/variants at shared caches. New headers cannot erase old cached responses. |
| Service worker | `vite.config.ts` precaches static asset types and has no configured API runtime cache. | Check the deployed and older workers and Cache Storage names; evict any historical API caches. Do not claim the current config proves old devices clean. |
| Browser state | `src/lib/authClient.ts` persists auth state; context code also uses browser storage. | Review historical application-state storage, open administrator tabs, device/shared-browser copies and client memory. Force a safe refresh/clear affected keys as approved without uploading their contents. Server cleanup cannot retract downloaded copies. |
| Logs and monitoring | Source review alone cannot establish historic retention or access. | Review Render, Supabase, proxies, error monitoring, support attachments and request/response tracing settings and metadata. Do not grep/dump raw bodies to chat or files. Restrict access; provider-side scrub/delete only with approval and retention/legal review. |
| Supabase backups/PITR/WAL, exports and replicas | Migration affects current rows, not historical copies. | Inventory retention windows, restore points, replicas, manual exports and staging copies with the provider/owner. Restrict access and let encrypted backups expire under the approved retention policy; delete only authorized disposable copies. Never create a new plaintext incident dump. |
| Restored data | A restore can reintroduce credentials and the vulnerable app. | Restore only into isolated restricted infrastructure, apply the scrub and guard, verify counts and patched code, then permit access. Do not restore invalidated passwords/sessions or silently undo remediation. |

## Security-remediation closure criteria (not met)

- Confirmed live target and aggregate pre/post results, or an explicit unresolved
  assessment limitation accepted by the owner.
- Verified containment deployment, zero remaining sensitive application keys,
  enabled guard, and synthetic storage/response regression checks.
- Approved cohort reconciled, account actions verified, failures resolved,
  notifications/support delivered, and JWT expiry/denial verified.
- Cache/log/backup owners, retention dates and restore controls recorded.
- Owner accepts any residual historical-copy risk. These conditions have not
  been demonstrated. Work is **deferred by owner direction**, and the exposure
  remains unresolved; a prepared runbook is not a completed production incident
  response.
