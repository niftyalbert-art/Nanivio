# Opt-in real-provider checks

These checks create real application accounts and contact real services. They are
not unit fixtures, provider mocks, or payment simulations.

## Safety and scope

- Obtain permission before creating the two PERSONAL accounts.
- Start the existing application workflow with its normal persistent authentication.
- Never disable authentication, insert browser sessions, grant paid credits, or
  purchase packages to make a test pass.
- Registration and browser sign-in use the application's actual endpoints/forms.
- Passwords and bearer tokens remain in the worker's memory. They are not printed,
  included in reports, or written to environment files.
- A private, permission-restricted Unix socket controls the worker; it opens no
  HTTP service or public port.
- The worker refuses a new account-creation run when its report already exists.
- Reports and screenshots are excluded from Git and deployment.
- Chromium uses isolated browser contexts and no fake media devices. Account and
  missed-call screenshots show actual authenticated state, not injected UI data.
- A successful Agora SDK join without publication is not a media-playback pass.
- Missing hardware, untranslated responses, and unmeasured quota consumption
  remain failures or explicit gaps. Do not relabel them as successes.

## Run only after explicit account-creation approval

```sh
node scripts/live-call-checks/worker.mjs \
  /tmp/nanivio-live-checks.sock --create-two-accounts
```

Send a single newline-terminated JSON command over the private socket:

```json
{"action":"run","origin":"workspace"}
{"action":"run","origin":"render"}
{"action":"browser"}
{"action":"status"}
{"action":"stop"}
```

Use separate connections for separate commands, and do not run suites concurrently.
`workspace` targets the managed application on port 5000. `render` targets the
user-supplied Malvi upgrade deployment, not Nanivio's main branch. Verify those
targets before reusing this helper elsewhere.

Stopping retains the two approved test accounts, but discards their transient
credentials. A later session must not silently create replacements or reset
passwords without the user's approval. The final report must distinguish the
workspace's changes from the unchanged Render version.
