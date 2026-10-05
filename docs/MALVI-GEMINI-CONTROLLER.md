# Malvi + Gemini Controller

Gemini is Malvi's server-side reasoning and tool-selection engine.

## Authority model
1. The user authenticates with Nanivio.
2. `/api/malvi/chat` sends the request and approved app context to Gemini.
3. Gemini may request one of the declared Malvi tools.
4. Nanivio converts the tool request into a safe UI action or confirmation proposal.
5. Sensitive operations remain server-authorized.

## Never delegated to Gemini
- Direct wallet mutation
- Direct payment settlement
- Paystack verification bypass
- Credit creation without a real billing event
- Admin privilege escalation
- Arbitrary database writes
- API key or secret access

## Tools
- `navigate_nanivio`
- `configure_langpretation`
- `find_expert`
- `propose_transfer` (proposal only)
- `request_admin_control` (admin session required)

`GEMINI_API_KEY` is server-only. The default model is `gemini-3.8-flash`, configurable with `MALVI_MODEL`.
