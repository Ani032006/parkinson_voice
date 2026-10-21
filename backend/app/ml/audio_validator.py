import io
import math
import numpy as np
import soundfile as sf
from typing import Tuple, Optional
from backend.app.core.config import MIN_AUDIO_DURATION_SEC, MAX_AUDIO_DURATION_SEC, MIN_AUDIO_ENERGY_RMS

class AudioValidationResult:
    def __init__(
        self,
        is_valid: bool,
        duration_sec: float,
        sample_rate: int,
        error_message: Optional[str] = None,
        snr_db: Optional[float] = None,
        clipping_pct: float = 0.0,
        quality_warning: Optional[str] = None
    ):
        self.is_valid = is_valid
        self.duration_sec = duration_sec
        self.sample_rate = sample_rate
        self.error_message = error_message
        self.snr_db = snr_db
        self.clipping_pct = clipping_pct
        self.quality_warning = quality_warning

def validate_audio_file(file_bytes: bytes, filename: str) -> Tuple[AudioValidationResult, Optional[np.ndarray], int]:
    """
    Validates uploaded audio data for minimum duration, acceptable audio energy,
    clipping, signal-to-noise ratio (SNR), and valid format.
    """
    try:
        data, samplerate = sf.read(io.BytesIO(file_bytes))
    except Exception as e:
        return AudioValidationResult(
            is_valid=False,
            duration_sec=0.0,
            sample_rate=0,
            error_message=f"Unsupported or corrupted audio format ({str(e)}). Please upload a valid WAV, MP3, or FLAC audio file."
        ), None, 0

    # Convert multi-channel to mono if necessary
    if data.ndim > 1:
        data = np.mean(data, axis=1)

    duration = len(data) / float(samplerate)

    if duration < MIN_AUDIO_DURATION_SEC:
        return AudioValidationResult(
            is_valid=False,
            duration_sec=duration,
            sample_rate=samplerate,
            error_message=f"Audio sample is too short ({duration:.1f}s). Please sustain the vocalization for at least {MIN_AUDIO_DURATION_SEC} seconds."
        ), None, samplerate

    if duration > MAX_AUDIO_DURATION_SEC:
        return AudioValidationResult(
            is_valid=False,
            duration_sec=duration,
            sample_rate=samplerate,
            error_message=f"Audio sample exceeds maximum allowed duration ({duration:.1f}s > {MAX_AUDIO_DURATION_SEC}s)."
        ), None, samplerate

    # Calculate RMS energy to detect near-silence or blank recording
    rms = float(np.sqrt(np.mean(np.square(data))))
    if rms < MIN_AUDIO_ENERGY_RMS:
        return AudioValidationResult(
            is_valid=False,
            duration_sec=duration,
            sample_rate=samplerate,
            error_message="Audio level is too quiet or silent. Please speak directly into the microphone at a normal volume and re-record."
        ), None, samplerate

    # SNR Estimation and Clipping Detection
    clipping_count = np.sum(np.abs(data) >= 0.99)
    clipping_pct = float((clipping_count / len(data)) * 100.0) if len(data) > 0 else 0.0

    frame_len = int(samplerate * 0.05)  # 50ms frames
    snr_db = None
    quality_warning = None

    if len(data) >= frame_len * 5:
        num_frames = len(data) // frame_len
        frames = data[:num_frames * frame_len].reshape(num_frames, frame_len)
        frame_rms = np.sqrt(np.mean(np.square(frames), axis=1))
        noise_floor = float(np.percentile(frame_rms, 10))
        signal_level = float(np.percentile(frame_rms, 90))
        if noise_floor > 1e-5 and signal_level > noise_floor:
            snr_db = round(float(20.0 * np.log10(signal_level / noise_floor)), 1)
        else:
            snr_db = 32.0

    if snr_db is not None and snr_db < 10.0:
        quality_warning = f"High ambient background noise detected (SNR: {snr_db} dB). For best clinical acoustic precision, record in a quieter environment."
    elif clipping_pct > 3.0:
        quality_warning = f"Audio clipping detected ({clipping_pct:.1f}% peak distortion). Please speak a bit further from the microphone."

    return AudioValidationResult(
        is_valid=True,
        duration_sec=duration,
        sample_rate=samplerate,
        snr_db=snr_db,
        clipping_pct=clipping_pct,
        quality_warning=quality_warning
    ), data, samplerate
