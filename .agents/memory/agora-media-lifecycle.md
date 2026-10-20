---
name: Agora media lifecycle
description: Device-track identity changes and ownership rules for call capture and display.
---

Agora can replace its underlying browser media track when a microphone or camera
is disabled and re-enabled. Treat these controls as asynchronous and refresh
stream bindings after successful changes; do not assume track identity is stable.

**Why:** A check using the real Agora SDK and Chromium synthetic devices reproduced
an ended track remaining in the app's stream after re-enabling capture. Static
track mocks did not expose this behavior.

**How to apply:** Include real-SDK browser capture and device-toggle checks when
changing media lifecycle code, alongside mocked connection/failure tests.

Keep capture owned by the call controller, not by the component displaying video.
Local preview readiness must not depend on a remote participant publishing media.

**Why:** Starting capture from the display could overlap the controller's device
startup. Gating the display on remote media also hid a working local preview.

**How to apply:** Let display components subscribe to streams and keep permission,
cancellation, capture cleanup, and preview-to-call handoff in the media lifecycle.

Stopping known tracks does not cancel an unresolved browser capture request.
Coalesce concurrent previews and finish cancelled capture cleanup before opening
devices for the answered call.

**Why:** The user reported `NOT_READABLE` / “Could not start video source” around
the local picture-in-picture controls. Inspection found overlay-owned preview
capture and a pending preview-to-join overlap. This error identifies local device
startup failure; it does not establish an Agora credential or credit failure.

**How to apply:** Test answering while camera acquisition is pending, not only
after a completed preview. Distinguish device-busy errors from permission,
token, and network failures; do not promise a provider switch will fix capture.
