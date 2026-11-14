import httpx
import pytest
from es_core.transcribe import FasterWhisperTranscriber, GroqTranscriber, TranscriptionError, get_transcriber


def test_groq_adapter_parses_word_timings(tmp_path, monkeypatch):
    audio = tmp_path / "a.webm"
    audio.write_bytes(b"xx")
    seen = {}

    def handler(request: httpx.Request):
        seen["auth"] = request.headers["authorization"]
        return httpx.Response(200, json={"text": "hello world", "duration": 2.0, "words": [
            {"word": "hello", "start": 0.4, "end": 0.8}, {"word": "world", "start": 1.2, "end": 1.7}]})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    tr = GroqTranscriber(api_key="test-key", client=client).transcribe(str(audio), "en")
    assert [w.text for w in tr.words] == ["hello", "world"] and tr.words[1].start == 1.2
    assert seen["auth"] == "Bearer test-key"


def test_groq_requires_key_and_reports_http_errors(tmp_path, monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(TranscriptionError):
        GroqTranscriber()
    audio = tmp_path / "a.webm"
    audio.write_bytes(b"xx")
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401)))
    with pytest.raises(TranscriptionError):
        GroqTranscriber(api_key="k", client=client).transcribe(str(audio), "en")


def test_default_is_local_and_groq_only_when_asked(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "k")
    monkeypatch.delenv("ES_TRANSCRIBER", raising=False)
    assert isinstance(get_transcriber(), FasterWhisperTranscriber)
    monkeypatch.setenv("ES_TRANSCRIBER", "auto")
    assert isinstance(get_transcriber(), GroqTranscriber)


def test_browser_webm_opus_is_decodable_without_ffmpeg(tmp_path):
    """MediaRecorder gives webm/opus. PyAV (inside faster-whisper) must read it; no model is loaded here."""
    av = pytest.importorskip("av")
    np = pytest.importorskip("numpy")
    from faster_whisper.audio import decode_audio
    path = tmp_path / "rec.webm"
    sr, n = 48000, 48000
    t = np.arange(n) / sr
    pcm = (np.sin(2 * np.pi * 440 * t) * 8000).astype("int16")
    try:
        out = av.open(str(path), "w", format="webm")
        stream = out.add_stream("libopus", rate=sr)
    except Exception as e:
        pytest.skip(f"no opus encoder in this PyAV build: {e}")
    frame = av.AudioFrame.from_ndarray(pcm.reshape(1, -1), format="s16", layout="mono")
    frame.sample_rate = sr
    for pkt in stream.encode(frame):
        out.mux(pkt)
    for pkt in stream.encode(None):
        out.mux(pkt)
    out.close()
    audio = decode_audio(str(path), sampling_rate=16000)
    assert 0.8 < len(audio) / 16000 < 1.3
    assert abs(audio).max() > 0.05
