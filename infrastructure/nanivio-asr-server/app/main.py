from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from .inference import (
    DEVICE,
    MODEL_ID,
    NANIVIO_LANGUAGE_TO_DONDO,
    engine,
)


SUPPORTED_LANGUAGES = tuple(
    sorted(NANIVIO_LANGUAGE_TO_DONDO.keys())
)

MAX_AUDIO_BYTES = 25 * 1024 * 1024


app = FastAPI(
    title="Nanivio ASR Inference Server",
    version="1.0.0",
)


@app.get("/health")
def health() -> dict:
    """
    Lightweight service health endpoint.

    This endpoint does not claim that ASR inference is ready.
    It reports the actual model-loading state.
    """
    return {
        "status": (
            "ready"
            if engine.loaded
            else "configured"
        ),
        "service": "nanivio-asr",
        "modelId": MODEL_ID,
        "device": DEVICE,
        "loaded": engine.loaded,
        "languages": list(SUPPORTED_LANGUAGES),
    }


@app.get("/ready")
def ready() -> dict:
    """
    Readiness endpoint.

    A service is ready only when the model has actually
    been loaded successfully into memory.
    """
    if not engine.loaded:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "model_not_ready",
                "message": (
                    "Nanivio ASR model is configured but "
                    "has not been loaded yet."
                ),
                "modelId": MODEL_ID,
            },
        )

    return {
        "status": "ready",
        "service": "nanivio-asr",
        "modelId": MODEL_ID,
        "device": DEVICE,
        "loaded": True,
        "languages": list(SUPPORTED_LANGUAGES),
    }


@app.get("/v1/models")
def models() -> dict:
    return {
        "models": [
            {
                "id": MODEL_ID,
                "languages": list(SUPPORTED_LANGUAGES),
                "status": (
                    "ready"
                    if engine.loaded
                    else "configured"
                ),
                "device": DEVICE,
            }
        ]
    }


@app.post("/v1/asr/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form(...),
) -> dict:

    if language not in NANIVIO_LANGUAGE_TO_DONDO:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "unsupported_language",
                "language": language,
                "supportedLanguages": list(
                    SUPPORTED_LANGUAGES
                ),
            },
        )

    audio_bytes = await audio.read()

    if not audio_bytes:
        raise HTTPException(
            status_code=400,
            detail="Audio file is empty.",
        )

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "error": "audio_too_large",
                "message": (
                    "Audio file exceeds the Nanivio ASR "
                    "maximum request size."
                ),
                "maxBytes": MAX_AUDIO_BYTES,
            },
        )

    if not engine.loaded:
        try:
            engine.load()
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "model_load_failed",
                    "message": str(exc),
                    "modelId": MODEL_ID,
                },
            ) from exc

    try:
        result = engine.transcribe(
            audio=audio_bytes,
            language=language,
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_audio",
                "message": str(exc),
            },
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "asr_inference_failed",
                "message": str(exc),
                "modelId": MODEL_ID,
            },
        ) from exc