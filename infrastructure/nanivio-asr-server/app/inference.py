import io
import os
import time
from typing import Dict

import numpy as np
import soundfile as sf
import torch
import torchaudio
from transformers import AutoModelForCTC, AutoProcessor


MODEL_ID = os.getenv(
    "NANIVIO_ASR_MODEL_ID",
    "KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en",
)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# DONDO uses a shared language-prefix map.
# These IDs come from the official DONDO model documentation.
LANGUAGE_MAP: Dict[str, int] = {
    "Adangme": 0,
    "Akuapem Twi": 1,
    "Asante Twi": 2,
    "Dagbani": 3,
    "Dagaare": 4,
    "Ewe": 5,
    "African English": 6,
    "Fante": 7,
    "French": 8,
    "Ga": 9,
    "Gonja": 10,
    "Gurene": 11,
    "Hausa": 12,
    "Igbo": 13,
    "Kasem": 14,
    "Kikuyu": 15,
    "Konkomba (Likpakpaanl)": 16,
    "Konkomba (Likoonli)": 17,
    "Krio": 18,
    "Kusaal": 19,
    "Luo": 20,
    "Mampruli": 21,
    "Mende": 22,
    "Meru/Kimeru": 23,
    "Nzema": 24,
    "Pidgin": 25,
    "Shona": 26,
    "Swahili": 27,
    "Temne": 28,
    "Wali": 29,
    "Wolof": 30,
    "Yoruba": 31,
}


# Only languages actually represented by this checkpoint
# and present in Nanivio's 18-language product matrix.
NANIVIO_LANGUAGE_TO_DONDO = {
    "en": "African English",
    "fr": "French",
    "ak": "Asante Twi",
    "fat": "Fante",
    "ee": "Ewe",
    "gaa": "Ga",
}


class NanivioASREngine:
    def __init__(self) -> None:
        self.model_id = MODEL_ID
        self.device = DEVICE
        self.processor = None
        self.model = None
        self.loaded = False

    def load(self) -> None:
        if self.loaded:
            return

        self.processor = AutoProcessor.from_pretrained(
            self.model_id
        )

        self.model = AutoModelForCTC.from_pretrained(
            self.model_id
        )

        self.model.to(self.device)
        self.model.eval()

        self.loaded = True

    @staticmethod
    def _decode_audio(
        audio: bytes,
    ) -> tuple[np.ndarray, int]:
        try:
            waveform, sample_rate = sf.read(
                io.BytesIO(audio),
                dtype="float32",
                always_2d=True,
            )
        except Exception as exc:
            raise ValueError(
                f"Unable to decode audio. Expected a valid WAV/audio file: {exc}"
            ) from exc

        if waveform.size == 0:
            raise ValueError("Decoded audio contains no samples.")

        # Convert multi-channel audio to mono.
        waveform = waveform.mean(axis=1)

        return waveform, sample_rate

    @staticmethod
    def _resample(
        waveform: torch.Tensor,
        sample_rate: int,
    ) -> torch.Tensor:
        if sample_rate == 16000:
            return waveform

        return torchaudio.functional.resample(
            waveform,
            sample_rate,
            16000,
        )

    @staticmethod
    def _add_language_prefix(
        features: torch.Tensor,
        language_id: int,
        prefix_len: int = 1,
    ) -> torch.Tensor:
        _, feature_dim = features.shape

        language_vector = torch.zeros(
            feature_dim,
            dtype=features.dtype,
            device=features.device,
        )

        language_vector[language_id % feature_dim] = 1.0

        prefix = language_vector.unsqueeze(0).repeat(
            prefix_len,
            1,
        )

        return torch.cat(
            [prefix, features],
            dim=0,
        )

    def transcribe(
        self,
        audio: bytes,
        language: str,
    ) -> dict:
        if language not in NANIVIO_LANGUAGE_TO_DONDO:
            raise ValueError(
                f"Language {language} is not supported by the "
                f"currently deployed DONDO checkpoint."
            )

        self.load()

        started = time.perf_counter()

        waveform, sample_rate = self._decode_audio(audio)

        waveform_tensor = torch.from_numpy(
            waveform
        ).unsqueeze(0)

        waveform_tensor = self._resample(
            waveform_tensor,
            sample_rate,
        )

        speech = waveform_tensor.squeeze(0).numpy()

        features = self.processor(
            speech,
            sampling_rate=16000,
            return_tensors="pt",
        ).input_features[0]

        language_name = NANIVIO_LANGUAGE_TO_DONDO[
            language
        ]

        language_id = LANGUAGE_MAP[language_name]

        features = self._add_language_prefix(
            features,
            language_id,
        )

        features = features.unsqueeze(0).to(
            self.device
        )

        with torch.no_grad():
            logits = self.model(
                input_features=features
            ).logits

        predicted_ids = torch.argmax(
            logits,
            dim=-1,
        )

        text = self.processor.batch_decode(
            predicted_ids
        )[0].strip()

        elapsed_ms = int(
            (time.perf_counter() - started) * 1000
        )

        return {
            "text": text,
            "language": language,
            "provider": "nanivio",
            "modelId": self.model_id,
            "device": self.device,
            "durationMs": elapsed_ms,
        }


engine = NanivioASREngine()
