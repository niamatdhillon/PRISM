"""Ollama client with explicit status, typed errors and timeouts. Never pretends a model is running; never silently substitutes models."""
import re
from typing import Dict, List, Optional
from urllib.parse import urlparse

from . import config


class LlmError(Exception):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind, self.message = kind, message


LOOPBACK = {"localhost", "127.0.0.1", "::1"}


def _headers() -> Dict:
    return {"Authorization": f"Bearer {config.OLLAMA_API_KEY}"} if config.OLLAMA_API_KEY else {}


def resolve_cfg(stored: Optional[Dict] = None) -> Dict:
    s = stored or {}
    explicit = bool(s["explicit"]) if "explicit" in s else bool(s.get("host")) or config.OLLAMA_HOST_SET   # idempotent: a resolved dict keeps its flag
    return {"host": (s.get("host") or config.OLLAMA_HOST).rstrip("/"), "model": s.get("model") or config.OLLAMA_MODEL, "timeout": float(s.get("timeout") or config.OLLAMA_TIMEOUT_S), "explicit": explicit}


def validate_host(host: str) -> str:
    u = urlparse(host)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise ValueError("Ollama host must be an http(s) URL")
    if u.hostname not in LOOPBACK:
        if not config.ALLOW_REMOTE_OLLAMA:
            raise ValueError("only loopback Ollama hosts are accepted (set PRISM_ALLOW_REMOTE_OLLAMA=1 to allow a remote, authenticated endpoint; never expose a bare Ollama server publicly)")
        if u.scheme != "https":
            raise ValueError("a remote Ollama endpoint must use https")
    return host.rstrip("/")


def status(cfg: Optional[Dict] = None) -> Dict:
    import requests
    c = resolve_cfg(cfg)
    if config.IS_PROD and not c["explicit"]:   # production never falls back to a localhost default
        return {"host": None, "configured_model": None, "available": False, "models": [], "model": None, "version": None, "running_models": [], "state": "not_configured",
                "reason": "No generation endpoint is configured for this deployment (set OLLAMA_HOST to a secured Ollama endpoint). Answers use extractive retrieval."}
    base = {"host": c["host"], "configured_model": c["model"] or None, "available": False, "models": [], "model": None, "version": None, "running_models": []}
    try:
        validate_host(c["host"])
    except ValueError as e:
        return {**base, "state": "host_rejected", "reason": str(e)}
    try:
        r = requests.get(c["host"] + "/api/tags", timeout=4.0, headers=_headers()); r.raise_for_status()
        models = [{"name": m["name"], "size_gb": round(m.get("size", 0) / 1e9, 2), "parameters": m.get("details", {}).get("parameter_size"), "quant": m.get("details", {}).get("quantization_level")} for m in r.json().get("models", [])]
    except requests.exceptions.ConnectionError:
        return {**base, "state": "unreachable", "reason": f"Ollama is not reachable at {c['host']}. Start it (Ollama app or `ollama serve`) or check OLLAMA_HOST."}
    except requests.exceptions.Timeout:
        return {**base, "state": "unreachable", "reason": f"Ollama did not respond within 4 s at {c['host']}."}
    except requests.exceptions.HTTPError as e:
        code = e.response.status_code if e.response is not None else 0
        return {**base, "state": "unauthorised" if code in (401, 403) else "error", "reason": ("The Ollama endpoint rejected the credentials (check OLLAMA_API_KEY)." if code in (401, 403) else f"Ollama returned HTTP {code}.")}
    except Exception as e:  # noqa: BLE001
        return {**base, "state": "error", "reason": f"{type(e).__name__}: {str(e)[:150]}"}
    try:
        base["version"] = requests.get(c["host"] + "/api/version", timeout=4.0, headers=_headers()).json().get("version")
        base["running_models"] = [m["name"] for m in requests.get(c["host"] + "/api/ps", timeout=4.0, headers=_headers()).json().get("models", [])]
    except Exception:  # noqa: BLE001
        pass
    base["models"] = models
    names = [m["name"] for m in models]
    if not names:
        return {**base, "state": "no_models", "reason": "Ollama is running but no model is installed. Run `ollama pull qwen2.5:3b` (about 1.9 GB)."}
    if c["model"]:
        if c["model"] not in names:
            return {**base, "state": "model_missing", "reason": f"Configured model '{c['model']}' is not installed. Installed: {', '.join(names)}."}
        return {**base, "state": "ready", "available": True, "model": c["model"], "reason": "ok"}
    return {**base, "state": "ready", "available": True, "model": names[0], "reason": "ok (first installed model; set one explicitly in Ollama settings)"}


def chat(cfg: Optional[Dict], model: str, system: str, user: str, max_tokens: int = 350) -> str:
    import requests
    c = resolve_cfg(cfg)
    validate_host(c["host"])
    try:
        r = requests.post(c["host"] + "/api/chat", timeout=c["timeout"], headers=_headers(), json={
            "model": model, "stream": False, "options": {"temperature": 0.1, "num_predict": max_tokens},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    except requests.exceptions.Timeout:
        raise LlmError("timeout", f"Ollama did not answer within {c['timeout']:.0f}s (the model may still be loading).")
    except requests.exceptions.ConnectionError:
        raise LlmError("unreachable", "Ollama became unreachable.")
    if r.status_code == 404:
        raise LlmError("model_missing", f"Model '{model}' not found in Ollama.")
    if not r.ok:
        raise LlmError("http_error", f"Ollama returned HTTP {r.status_code}: {r.text[:150]}")
    try:
        return r.json()["message"]["content"].strip()
    except Exception:  # noqa: BLE001
        raise LlmError("bad_response", "Unexpected response format from Ollama.")


NUM = re.compile(r"(?<![\w.])-?\d+(?:\.\d+)?")


def explain_metrics(cfg: Optional[Dict], model: str, metrics_text: str) -> Dict:
    """LLM-written plain-language explanation of ALREADY COMPUTED metrics. Every number in the output is checked against the input."""
    system = ("You explain machine-learning evaluation results to researchers in plain English. Use ONLY the numbers in the provided text. Copy every number "
              "EXACTLY as written (for example 0.676, never 67.6%; never round, convert or compute new numbers). Counts of rows are epochs or sessions, NOT people; "
              "groups are the people. Do not mention any dataset, paper or claim that is not in the text. If something is not in the text, say it is not available. "
              "Maximum 150 words.")
    text = chat(cfg, model, system, "Evaluation results:\n" + metrics_text)
    allowed = set(NUM.findall(metrics_text))
    bad = sorted({n for n in NUM.findall(text) if n not in allowed and n.lstrip("-") not in {"1", "2", "3", "4", "5", "95", "25"}})
    return {"text": text, "unverified_numbers": bad, "verified": not bad,
            "note": "Only NUMBERS are checked (string-matched against the stored evaluation). Wording is not verified: small local models can mislabel units (e.g. call epochs 'subjects'). The structured results are the source of truth; this text is a convenience."}
