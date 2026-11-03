# Enable Google and Apple sign-in

The buttons and PKCE callback use Nanivio's existing Supabase authentication.
They do not migrate accounts to another authentication service.

## Supabase

1. Open **Authentication → Sign In / Providers** in the existing project.
2. Enable **Google**, configure its OAuth credentials in Supabase, and save.
3. Enable **Apple**, configure the Apple Services ID and signing credentials
   required by Supabase, and save. Apple web sign-in requires an Apple Developer
   setup; adding the button does not create that setup.
4. Under **Authentication → URL Configuration**, allow the exact callback URL:
   `https://nanivioupgrades.onrender.com/auth/callback`.
5. For preview testing, add the preview's own HTTPS origin followed by
   `/auth/callback`. Never use a broad wildcard production redirect.
6. In Google and Apple, use the Supabase provider callback URL shown in the
   relevant Supabase provider panel. It is different from the Nanivio app callback.

Keep client secrets and private keys inside the provider/Supabase configuration.
Do not paste them into chat or put them in frontend code. The browser receives
only Supabase's public URL and public anon key, never the service-role key.

## Expected behaviour

- Disabled provider: the button shows an honest setup-unavailable message;
  email/password sign-in remains available.
- Existing active Nanivio account linked by Supabase: finish provider consent,
  return to Nanivio, then show the existing successful-sign-in effect.
- New provider identity: return to registration with the provider email filled in.
  The user still supplies their country, unique phone, preferred language,
  password and required verification. No minutes or paid plan are invented.
- Choosing another email uses ordinary registration, not the previous social
  identity. Provider identity ownership is always verified on the server.
- Suspended or deactivated profiles cannot use social sign-in to reactivate.

Both provider settings were disabled when this feature was implemented.
Local SDK/PKCE and profile-flow tests are not proof of live Google or Apple
consent, Apple private-relay delivery, or production provider configuration.
