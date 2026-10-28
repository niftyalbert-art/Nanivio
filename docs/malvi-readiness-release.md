# Malvi readiness release

## Deployment prerequisite — do not push/deploy before setup

1. Back up the existing Supabase database using the owner's normal procedure.
2. In the existing project's Supabase SQL editor, run
   `migrations/013_malvi_live_allowances.sql`. Do not replace the database or rerun
   the earlier migrations. This migration needs migrations 002, 005 and 012.
3. Release the updated code to the approved `malvi-production-upgrade` branch.
4. In **Admin → Billing → Malvi plans → Malvi usage safety limits**, set all four
   limits and save a reason. The initial values are deliberately unconfigured,
   not unlimited. Do this before enabling customer use:
   - Shared live minutes per UTC calendar month, across voice and avatar.
   - Research attempts per user per UTC calendar month.
   - Analysis attempts per user per UTC calendar month.
   - Uploaded MiB per user per UTC calendar month.
5. Choose limits using the actual provider account quotas and budget. The cost
   calculator is an estimate; its assumptions are not enforced dollar balances.
   Zero disables that kind of usage. These safety caps do not change prices,
   purchased minute allowances or subscription renewal dates.
6. Keep the Voice plan in draft until the database and shared live limit are set.
   Set its price and voice allowance deliberately before publishing. No automatic
   price or allowance is introduced.

Database and runtime-limit failures block new provider work. They do not start
unmetered sessions. This release uses the existing Malvi credit balance in
addition to the subscription's voice/video allowance; it does not debit a
communication wallet or create an external payment.

## Metering and interruption

- A session reserves up to ten minutes, limited by available Malvi credit,
  the appropriate purchased allowance, subscription expiry and shared cap.
- Ordinary closing charges elapsed reserved time and returns the unused portion.
  Failed setup before a provider session exists returns the reservation.
- Concurrent starts cannot spend the same allowance. Retries of the same
  reservation/settlement are idempotent.
- If the server crashes, the reservation stays protected until its hard expiry.
  The next start reconciles it using confirmed server time, returns unused credit
  and does not revive the old session. Some capacity can remain held until that
  expiry; this is intentional protection against overlapping paid sessions.
- Research/analysis caps count accepted attempts, including provider failures;
  they are not claims about an exact provider invoice. Counters are shared in
  PostgreSQL and do not reset on process restart.
- A disconnected conversation stops microphone capture. Recovery requires an
  explicit **Start a new conversation** action after cleanup. It is a new paid
  session within the existing hourly start limit, not automatic audio replay.
- Selecting Free preserves any existing trial or purchased term. It cannot
  restart a trial, refill minutes or replace purchased benefits.
- Phone countdowns use server-relative time and a monotonic clock. Returning to
  the app rechecks time without renewing inactivity.

## Required owner acceptance checks on Render

Authenticated UI and real provider timing cannot be proved by the public health
endpoint or mocked tests. No paid provider tests are authorized by this release.

1. On Android Chrome, speak and listen beyond one minute; check response delay,
   audible lip synchronisation, user/assistant subtitles and interrupt behaviour.
2. Verify Voice starts without opening an avatar session and ends its microphone.
3. Close/restart and check that unused reservation is returned once in Billing.
4. Test a near-empty allowance: session must stop at its reserved limit.
5. Briefly disconnect the network; microphone must stop and recovery must not
   replay the last recording or start paid sessions without a tap.
6. Change the phone clock, background/resume, and verify the countdown remains
   consistent with server expiry.
7. Test each advertised language with a proficient speaker. Available in a menu
   does not mean speech quality has been verified.
8. Confirm returning-user memory only with consent and confirm a second account
   cannot retrieve the first account's history.
