# Malvi inputs, public media and navigation

## Available surfaces

- The Malvi workspace accepts a question and one explicit attachment: JPEG/PNG,
  MP4/WebM video, MP3/WAV/OGG audio, PDF, UTF-8 TXT/Markdown/CSV or valid JSON.
- Binary input is limited to 8 MiB; text documents to 128 KiB. Video analysis
  supplies a server-controlled interval of 0–60 seconds at one frame per second.
  This can miss fine motion or brief events. Whole long videos and arbitrary
  file formats are not supported.
- Record voice uses standard permission-based audio capture and MediaRecorder,
  converts the clip to 16 kHz mono WAV, and stops after 60 seconds. It does not
  depend on a browser speech-recognition service and does not replace the
  existing live Nanivio Mic engine.
- Results are separately selectable/copyable, with a manual selection fallback.
- Wikimedia Commons image/video search is available without first asking for
  AI analysis. Real returned assets include author, license and source links.
  Codec support varies; the source link remains available for unsupported video.
  Video assets over 32 MiB are excluded from the embedded gallery.
- Text and live conversations also have read-only media-search and Google Maps
  link tools. Maps never opens automatically, and returned links do not establish
  that a place was uniquely identified or a route was calculated.

## Privacy

The user explicitly consents before sending their prompt, chosen file and chosen
location to Gemini. No arbitrary remote attachment URL is fetched. Uploaded
content is not executed or treated as system instructions. Provider processing
is subject to the provider's own data policies; this is not a zero-retention
promise.

Raw uploads are not stored in Nanivio's conversation archive. When account memory
is enabled, the question and answer can be saved under that authenticated account,
along with a filename/type marker, not the raw file. Replies can include excerpts
from the attachment. Requests with an explicitly shared location are not archived
by this workspace, including their generated answer. Users can still copy them.

GPS requires a user-initiated browser permission request. It is a single position,
not continuous tracking. Location is held only in the current workspace and
can be removed or reset. Device-reported accuracy does not prove the location.

IP lookup is a separate, explicit browser request to `https://ipwho.is/`.
The user is informed that this shares their public IP with that service.
It is approximate and may identify a VPN/proxy exit rather than the user.
No server-side forwarded-IP guessing is used, and no lookup is made automatically.
There is no silent fallback from denied GPS to IP.

## Navigation

The user selected **Google Maps navigation**, not an embedded navigation engine.
The application uses official universal Maps URLs with `api=1`, URL-encoded
destination/origin, `travelmode=driving` and `dir_action=navigate`.
No Google Maps API key is required for these links. Maps handles actual routing,
traffic, road conditions and travel times; Nanivio does not calculate them.
GPS or an explicitly entered origin can be supplied. Approximate IP coordinates
are never used as a driving origin. Confirm the correct place in Maps and stop
safely before typing, watching video or interacting.

## Configuration and limits

- Existing server `GEMINI_API_KEY` is required for analysis.
- Optional administrator environment setting `MALVI_INPUT_MODEL` overrides the
  Gemini analysis model (default `gemini-3.8-flash`). Users cannot override it.
- Existing `MALVI_WEB_RESEARCH_ENABLED=false` disables public media search as
  well as public web research.
- The new authenticated routes are `POST /api/assistant/input` and
  `POST /api/assistant/media/research`; both honor the Malvi feature toggle.
- Analysis is bounded to one concurrent request per account per process, with
  a 45-second inference timeout. The existing four-per-minute per-account
  analysis/research limiter also applies. These are not distributed billing or
  entitlement guarantees across multiple server instances.
- Media search uses a fixed Commons API endpoint, a 10-second timeout and
  bounded metadata responses. It does not crawl arbitrary links.
- Public search is not access to all internet, social, private or paywalled
  sources. Analysis itself does not silently perform a web search. Use the
  separate cited public-web controls for current evidence.
- Analysis and voice may incur provider charges. No production credentials
  are included in client code.

## Verification boundary

Automated tests use mock inference and public-media responses; they do not
spend AI/avatar credits. Browser tests exercise the actual components and native
MediaRecorder with a synthetic audio stream, not a live spoken conversation.
Real Render inference, hardware permissions and Google Maps app handoff must
still be verified on physical target devices after deployment.
