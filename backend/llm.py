"""Optional local LLM through Ollama. Disabled in hosted mode (a hosted server must not call anyone's localhost)."""
from typing import Dict, List, Optional
from . import config


def status() -> Dict:
    if config.IS_HOSTED:
        return {"available": False, "reason": "Hosted mode: Ollama is a local-only component and is never contacted.", "models": [], "model": None}
    try:
        import requests  # local mode only; kept out of the hosted dependency set
        r = requests.get(config.OLLAMA_HOST + "/api/tags", timeout=1.5)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
    except Exception as e:  # noqa: BLE001 - any failure means "not available"
        return {"available": False, "reason": f"Ollama not reachable at {config.OLLAMA_HOST} ({type(e).__name__}).", "models": [], "model": None}
    if not models:
        return {"available": False, "reason": "Ollama is running but has no models installed (run `ollama pull <model>`).", "models": [], "model": None}
    chosen = config.OLLAMA_MODEL if config.OLLAMA_MODEL in models else (None if config.OLLAMA_MODEL else models[0])
    if chosen is None:
        return {"available": False, "reason": f"Configured OLLAMA_MODEL '{config.OLLAMA_MODEL}' is not installed.", "models": models, "model": None}
    return {"available": True, "reason": "ok", "models": models, "model": chosen}


def chat(model: str, system: str, user: str) -> str:
    import requests
    r = requests.post(config.OLLAMA_HOST + "/api/chat", timeout=config.OLLAMA_TIMEOUT_S, json={
        "model": model, "stream": False, "options": {"temperature": 0.1, "num_predict": 300},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    r.raise_for_status()
    return r.json()["message"]["content"].strip()
