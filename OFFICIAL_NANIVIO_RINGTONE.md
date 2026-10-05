# Official Nanivio Incoming Ringtone

The uploaded `ringtone-incoming.mp3` is the canonical Nanivio incoming-call ringtone.

- Asset: `public/sounds/ringtone-incoming.mp3`
- Source asset: `ringtone-incoming.mp3` supplied by Nanivio owner
- Duration: 8 seconds
- Format: MP3, 44.1 kHz, stereo
- Incoming audio calls: enabled
- Incoming video calls: enabled through the shared incoming-call ringtone handler
- Looping: enabled while the incoming call is ringing
- Stop conditions: accept, decline, end, or call-state cleanup
- Outgoing ringback remains separate

Browser autoplay restrictions can prevent playback until the browser permits audio. The application does not substitute a different ringtone when this happens.
