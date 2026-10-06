# Nanivio ASR Inference Server

Nanivio-owned inference service for production speech recognition.

## Current model

DONDO Southern Ghana multilingual ASR:

KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en

The model is downloaded and executed locally by the Nanivio inference service.
Nanivio does not call the Khaya API.

## Currently implemented model languages

- English
- French
- Asante Twi
- Fante
- Ewe
- Ga

Akuapem Twi is part of the wider Nanivio 18-language product matrix, but it is NOT currently implemented by this DONDO inference route.

## API

GET /health

GET /ready

GET /v1/models

POST /v1/asr/transcribe

Form fields:

audio: audio/wav
language: Nanivio language code

## Readiness and validation

A model is not considered production-ready merely because it loads.

Nanivio must validate:

1. model loading
2. health endpoint
3. readiness endpoint
4. English transcription
5. Twi transcription
6. Fante transcription
7. Ewe transcription
8. Ga transcription
9. French transcription
10. latency
11. memory usage
12. noisy audio
13. conversational audio

Only validated models should be marked healthy in the Nanivio language-engine registry.

## Deployment architecture

The Nanivio web application does not execute the 0.6B ASR model directly.

The production architecture is:

Nanivio Web Service
    |
    | HTTPS
    v
Nanivio ASR Inference Server
    |
    v
NVIDIA GPU
    |
    v
DONDO ASR model

The inference server is independently deployable and may run on a GPU-enabled cloud host.
