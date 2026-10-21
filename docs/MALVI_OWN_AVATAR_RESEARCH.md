# Malvi independent avatar engine: initial evaluation

Research date: 2026-10-17. This is a desk evaluation, not a rendered prototype or a production approval.

## Scope and preservation

Keep the existing HeyGen LiveAvatar LITE implementation intact. Develop the independent renderer separately and opt-in; do not switch current sessions or silently fail over between renderers. Retain Malvi's supplied identity and the existing independently owned brain/audio boundary.

Owning this integration does not mean owning exclusive rights to upstream models or eliminating GPU and brain-provider costs.

## Candidates

### MuseTalk 1.5 — first lip-sync baseline

Official repository: https://github.com/TMElyralab/MuseTalk

- Maintainers explicitly permit commercial use of their code and trained model.
- Other component licenses still require an inventory and review; repository test data is restricted to non-commercial research.
- Published speed is 30+ fps on a Tesla V100, not an end-to-end browser latency or concurrency guarantee.
- Operates on a 256-by-256 face region. Output frame resolution is not equivalent to generated facial detail.
- Primarily edits lip motion in source imagery/video; it is not by itself a complete generator of natural listening behavior, emotional performance, and head movement.
- A portrait-only test can evaluate mouth quality, but should not be represented as a natural full-performance avatar.

### Ditto — portrait-animation challenger

Official repository: https://github.com/antgroup/ditto-talkinghead
Official weights/model card: https://huggingface.co/digital-avatar/ditto-talkinghead

- Designed for audio-driven portrait animation, with online/offline pipelines.
- Repository and model card state Apache-2.0.
- Published tested environment uses an A100 and TensorRT; supplied optimized engines target Ampere-or-newer hardware. Other GPUs require compatibility checks and possibly engine conversion.
- Bundled assets include InsightFace-related detection models. A top-level Apache license must not be treated as evidence that every third-party weight is cleared for commercial use.
- Commercial dependency/weight audit and any necessary replacements are release gates.

### LivePortrait — supporting motion technology, not a standalone speech engine

Official license: https://github.com/KlingAIResearch/LivePortrait/blob/main/LICENSE

- Motion-driven portrait animation does not itself supply the entire audio-to-avatar pipeline.
- Its license explicitly warns that InsightFace pretrained models are non-commercial and must be replaced for commercial use.
- Do not adopt the default dependency bundle as a commercially cleared solution.

## Recommended experiment

1. Audit exact code revisions, downloaded weights, detectors, and their licenses before any hosted/commercial integration.
2. Use Malvi's original, rights-cleared portrait and independently generated/rights-cleared speech, not extracted HeyGen internals or repository demo identities.
3. Evaluate MuseTalk mouth quality and Ditto full-face motion separately. Do not combine them until there is evidence that doing so improves quality.
4. Use identical clips covering neutral speech, smiles, pauses, fast speech, and the actual languages required by Nanivio.
5. Record face/teeth/hair artifacts, identity consistency, audio/video offset, rendered fps, time to first playable frame, peak VRAM, and interruption behavior.
6. Test full brain-to-browser latency and concurrency separately from offline inference.
7. Calculate cost per active minute including idle GPU time, encoding, streaming, and concurrent-session capacity.
8. Compare with LiveAvatar using equivalent clips; do not claim parity with offline Avatar IV generation.

No quality, latency, or cost result has been measured yet.

## Integration boundaries after the experiment passes

- Keep the selected brain independent of rendering.
- Send generated speech to exactly the selected renderer; do not duplicate private audio across engines.
- Host inference on suitable GPU infrastructure; keep heavy weights outside the app repository.
- Use authenticated, short-lived sessions and an explicit audio format/sample-rate contract.
- Cancel pending audio and frames together on interruption; synchronize timestamps and apply backpressure.
- Apply existing idle/maximum-session limits and clean up GPU resources on disconnect.
- Keep renderer selection server-controlled and expose only verified readiness. An unconfigured experimental engine must fail clearly, not present a poster as live video.

## Current status

Research only. No model weights downloaded, GPU provisioned, inference executed, renderer added, runtime behavior changed, commit pushed, or deployment performed.
