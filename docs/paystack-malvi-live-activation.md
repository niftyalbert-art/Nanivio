# Deploying automatic Malvi payment activation

These changes require BOTH the server update and the external Supabase migration.
A Git push alone does not install a Supabase function.

## Production prerequisites

1. Open the Supabase project used by the Render service's `SUPABASE_URL`.
2. Run `migrations/014_paystack_malvi_activation.sql` in that project's SQL Editor.
   It requires the existing billing/auth/Malvi migrations (002, 003, 005);
   existing live allowance setups also use 013.
   It adds a server-only paid activation function and corrects live plan selection.
   It does not manually grant any purchase or alter any existing balance.
3. Deploy this branch's server build on Render. Keep the live Paystack secret
   in Render; a test-mode workspace key cannot reconcile a live payment.
4. In Paystack's **live** settings, use this webhook URL for the owner-confirmed
   external Render app:
   `https://nanivioupgrades.onrender.com/api/paystack/webhook`
   The merchant's actual transaction confirmation/callback URL must also point
   to a running app, not an old suspended service. The webhook activates benefits
   without requiring the user to return to checkout.

## How activation works

- A correctly signed live `charge.success` notification resolves the saved
  server-owned order and its purchased plan snapshot.
- The amount, currency and original account must match that order.
- Payment, monthly/annual subscription, invoice and spendable Malvi credit are
  written in a single database transaction.
- Repeat notifications, browser verification and backup reconciliation use the
  same payment/entitlement references. They do not refill used minutes, extend
  the term or charge the user again.
- An old trial row updated during session cleanup cannot replace a newer paid
  term for display or the next live reservation.
- A production-only worker checks pending Malvi purchases every 20 seconds
  (up to 10 eligible orders per batch from the last 30 days), as a backup for
  missed webhooks. Provider/network delays and backlog can take longer.
- Billing refreshes when the tab regains focus and every 15 seconds while open.
- Missing activation setup blocks new Malvi checkout before requesting payment.

## One read-only deployment check

Run this in the SAME Supabase project. It changes no data and returns one result.

```sql
SELECT
  to_regprocedure('public.nanivio_activate_paystack_malvi(jsonb)') IS NOT NULL
    AS paid_activation_installed,
  (SELECT status FROM public.nanivio_paystack_orders
    WHERE reference='NV-PSTK-1793480974397-1E82FD16B384') AS order_status,
  (SELECT count(*) FROM public.nanivio_payments
    WHERE provider='paystack'
      AND provider_reference='NV-PSTK-1793480974397-1E82FD16B384') AS payment_records,
  (SELECT count(*) FROM public.nanivio_malvi_subscriptions
    WHERE subscription_id='malvi_NV-PSTK-1793480974397-1E82FD16B384') AS subscriptions;
```

Expected after verified fulfilment: activation installed `true`, order
`FULFILLED`, one payment, one subscription. Do not alter rows to force this result.
If activation remains pending, inspect the Render errors for that reference.
Paystack must confirm the live payment before any value is granted.

## Verification boundary

The isolated tests execute the actual initialize, verification and signed webhook
handlers against PostgreSQL-compatible storage with a fixture gateway. They check
monthly/annual benefits, rollback on an invoice failure, repeat delivery after
usage and a subsequent actual live allowance reservation. They do not charge a
card or verify this customer's live transaction.

The two-browser Langpretation check exercises actual capture, client playback,
WebSocket transport and the server gateway using a separate connected-call fixture.
The explicitly authorized real-provider run passed in both English/French
directions. It is not a signed-in two-account Render test, and does not establish
all-language translation quality or speaker-clone accuracy.
