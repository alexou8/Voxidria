"""
ML Unit Tests — Voxidria Parkinson’s speech detection pipeline.

Run from repo root:
    pytest tests/ml/test_ml_unit.py -v

Covers:
  A) Artifact loading   — model .h5, scaler, feature_names all load correctly
  B) audioParser.py     — extract_features() returns non-empty finite floats
  C) parsel_parser.py   — extract_uci16() returns all 16 UCI feature groups
  D) predict.py         — predict_from_dict() returns probability ∈ [0,1]
  E) Smoke test         — full pipeline: WAV → features → model → 0–100 score
"""

import math
import os
import sys

import pytest

# ── Path setup ───────────────────────────────────────────────────────────────
REPO_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
ML_SRC_DIR   = os.path.join(REPO_ROOT, "backend", "ml")
ARTIFACTS    = os.path.join(REPO_ROOT, "ml", "artifacts")
SAMPLES      = os.path.join(REPO_ROOT, "ml", "samples")
HEALTHY_WAV = os.path.join(SAMPLES, "healthy_control.wav")
PD_WAV       = os.path.join(SAMPLES, "PD_patient.wav")

# Make backend/ml importable
sys.path.insert(0, ML_SRC_DIR)

# Silence TensorFlow startup logs before the first import of tf
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("PYTHONWARNINGS", "ignore")

# predict.py resolves artifact paths relative to CWD — set CWD to backend/ml
os.chdir(ML_SRC_DIR)


# ── A: Artifact loading ──────────────────────────────────────────────────────────

class TestArtifactLoading:
    """All three committed artifacts must exist and load without error."""

    def test_model_h5_exists(self):
        path = os.path.join(ARTIFACTS, "parkinsons_model.h5")
        assert os.path.isfile(path), f"Model not found: {path}"

    def test_scaler_exists(self):
        path = os.path.join(ARTIFACTS, "scaler.joblib")
        assert os.path.isfile(path), f"Scaler not found: {path}"

    def test_feature_names_exists(self):
        path = os.path.join(ARTIFACTS, "feature_names.joblib")
        assert os.path.isfile(path), f"Feature names not found: {path}"

    def test_all_artifacts_load(self):
        import joblib
        import tensorflow as tf

        model   = tf.keras.models.load_model(os.path.join(ARTIFACTS, "parkinsons_model.h5"))
        scaler  = joblib.load(os.path.join(ARTIFACTS, "scaler.joblib"))
        f_names = joblib.load(os.path.join(ARTIFACTS, "feature_names.joblib"))

        assert model   is not None
        assert scaler  is not None
        assert len(f_names) > 0

    def test_feature_count_is_22(self):
        """The UCI Parkinson’s dataset has exactly 22 voice biomarker columns."""
        import joblib
        f_names = joblib.load(os.path.join(ARTIFACTS, "feature_names.joblib"))
        assert len(f_names) == 22, (
            f"Expected 22 UCI features, got {len(f_names)}: {f_names}"
        )


# ── B: audioParser.py ───────────────────────────────────────────────────────────

class TestAudioParser:
    """audioParser.extract_features() — librosa-based jitter / shimmer proxy."""

    @pytest.fixture(autouse=True)
    def need_healthy_wav(self):
        if not os.path.isfile(HEALTHY_WAV):
            pytest.skip(f"Sample WAV not found: {HEALTHY_WAV}")

    def test_returns_dict(self):
        from audioParser import extract_features
        assert isinstance(extract_features(HEALTHY_WAV), dict)

    def test_non_empty(self):
        from audioParser import extract_features
        result = extract_features(HEALTHY_WAV)
        assert len(result) > 0, "extract_features returned an empty dict"

    def test_expected_keys_present(self):
        from audioParser import extract_features
        result = extract_features(HEALTHY_WAV)
        for key in ("Jitter(%)", "Shimmer", "PPE"):
            assert key in result, f"Missing key '{key}' in {list(result.keys())}"

    def test_all_values_are_finite_numbers(self):
        from audioParser import extract_features
        result = extract_features(HEALTHY_WAV)
        for k, v in result.items():
            assert isinstance(v, (int, float)), f"{k}: expected numeric, got {type(v)}"
            assert math.isfinite(v), f"{k}: non-finite value {v}"


# ── C: parsel_parser.py ──────────────────────────────────────────────────────────

class TestParselParser:
    """parsel_parser.extract_uci16() — Praat-based 16-feature UCI extraction."""

    @pytest.fixture(autouse=True)
    def need_healthy_wav(self):
        if not os.path.isfile(HEALTHY_WAV):
            pytest.skip(f"Sample WAV not found: {HEALTHY_WAV}")

    def test_returns_dict(self):
        from parsel_parser import extract_uci16
        assert isinstance(extract_uci16(HEALTHY_WAV), dict)

    def test_at_least_16_features(self):
        from parsel_parser import extract_uci16
        result = extract_uci16(HEALTHY_WAV)
        assert len(result) >= 16, f"Expected ≥16 features, got {len(result)}"

    def test_pitch_group(self):
        from parsel_parser import extract_uci16
        result = extract_uci16(HEALTHY_WAV)
        for key in ("MDVP:Fo(Hz)", "MDVP:Fhi(Hz)", "MDVP:Flo(Hz)"):
            assert key in result, f"Missing pitch feature '{key}'"

    def test_jitter_group(self):
        from parsel_parser import extract_uci16
        result = extract_uci16(HEALTHY_WAV)
        for key in ("MDVP:Jitter(%)", "MDVP:Jitter(Abs)", "MDVP:RAP",
                    "MDVP:PPQ", "Jitter:DDP"):
            assert key in result, f"Missing jitter feature '{key}'"

    def test_shimmer_group(self):
        from parsel_parser import extract_uci16
        result = extract_uci16(HEALTHY_WAV)
        for key in ("MDVP:Shimmer", "MDVP:Shimmer(dB)", "Shimmer:APQ3",
                    "Shimmer:APQ5", "MDVP:APQ", "Shimmer:DDA"):
            assert key in result, f"Missing shimmer feature '{key}'"

    def test_hnr_nhr_present(self):
        from parsel_parser import extract_uci16
        result = extract_uci16(HEALTHY_WAV)
        assert "HNR" in result, "Missing 'HNR'"
        assert "NHR" in result, "Missing 'NHR'"


# ── D: predict.py ─────────────────────────────────────────────────────────────────

class TestPredict:
    """predict.predict_from_dict() — model inference output shape and range."""

    @pytest.fixture(scope="class")
    def feature_names(self):
        import joblib
        return joblib.load(os.path.join(ARTIFACTS, "feature_names.joblib"))

    def test_returns_probability_and_label(self, feature_names):
        from predict import predict_from_dict
        dummy  = {f: 0.0 for f in feature_names}
        result = predict_from_dict(dummy)
        assert "probability_pd" in result, "Missing 'probability_pd' key"
        assert "prediction"     in result, "Missing 'prediction' key"

    def test_probability_in_unit_interval(self, feature_names):
        from predict import predict_from_dict
        dummy  = {f: 0.0 for f in feature_names}
        result = predict_from_dict(dummy)
        assert 0.0 <= result["probability_pd"] <= 1.0, (
            f"probability_pd out of range: {result['probability_pd']}"
        )

    def test_prediction_is_binary(self, feature_names):
        from predict import predict_from_dict
        dummy  = {f: 0.0 for f in feature_names}
        result = predict_from_dict(dummy)
        assert result["prediction"] in (0, 1), (
            f"prediction must be 0 or 1, got {result['prediction']}"
        )


# ── E: Smoke test — full pipeline ──────────────────────────────────────────────────

class TestFullPipeline:
    """WAV → feature extraction → model inference → 0–100 risk score."""

    @pytest.fixture(autouse=True)
    def need_healthy_wav(self):
        if not os.path.isfile(HEALTHY_WAV):
            pytest.skip(f"Sample WAV not found: {HEALTHY_WAV}")

    @pytest.fixture(scope="class")
    def feature_names(self):
        import joblib
        return joblib.load(os.path.join(ARTIFACTS, "feature_names.joblib"))

    def _score(self, wav_path, feature_names):
        """Return integer risk score (0–100) for a WAV file."""
        from parsel_parser import extract_uci16
        from predict import predict_from_dict
        raw      = extract_uci16(wav_path)
        features = {f: float(raw.get(f, 0.0)) for f in feature_names}
        result   = predict_from_dict(features)
        return int(round(result["probability_pd"] * 100))

    def test_healthy_sample_score_is_0_to_100(self, feature_names):
        score = self._score(HEALTHY_WAV, feature_names)
        print(f"\n[SMOKE] healthy_control.wav risk score: {score}/100")
        assert 0 <= score <= 100, f"Risk score out of range: {score}"

    def test_pd_sample_score_is_0_to_100(self, feature_names):
        if not os.path.isfile(PD_WAV):
            pytest.skip(f"PD sample not found: {PD_WAV}")
        score = self._score(PD_WAV, feature_names)
        print(f"[SMOKE] PD_patient.wav risk score: {score}/100")
        assert 0 <= score <= 100, f"Risk score out of range: {score}"
