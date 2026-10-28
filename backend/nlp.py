"""Text preprocessing, linguistic features, theme lexicons and TF-IDF term weighting.

Everything here is classical, inspectable NLP (no black boxes). Lexicons are small hand-written
word lists intended to *describe* a reflection, not to measure psychological state.
"""
import re
import unicodedata
from typing import Dict, List

STOPWORDS = set("""a about above after again against all also am an and any are aren't as at be because been before being below
between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further
had hadn't has hasn't have haven't having he her here hers herself him himself his how i if in into is isn't it its itself just
let's me more most my myself no nor not of off on once only or other ought our ours ourselves out over own same she should
shouldn't so some such than that the their theirs them themselves then there these they this those through to too under until
up very was wasn't we were weren't what when where which while who whom why will with won't would wouldn't you your yours
yourself yourselves what's however thus may might much many one two new use used using make makes made get got really""".split())

NEGATIONS = {"not", "no", "never", "n't", "cannot", "hardly", "without", "neither", "nor"}
FIRST_PERSON = {"i", "me", "my", "mine", "myself", "i'm", "i've", "i'd", "i'll"}
TOKEN_RE = re.compile(r"[a-z]+(?:'[a-z]+)?|\d+(?:\.\d+)?")
SENT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(\[])")


def normalise(text: str) -> str:
    t = unicodedata.normalize("NFKC", text or "")
    t = t.replace("’", "'").replace("‘", "'")
    t = re.sub(r"https?://\S+", " ", t)
    t = t.lower()
    return re.sub(r"\s+", " ", t).strip()


def stem(w: str) -> str:
    """Deliberately crude suffix stripper (NOT the Porter algorithm). It conflates e.g.
    distract/distracted/distracting/distraction, which is enough for small-corpus TF-IDF."""
    if len(w) <= 3 or w.isdigit():
        return w
    w = w.replace("'s", "")
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("sses"):
        return w[:-2]
    for suf in ("ations", "ation", "ions", "ion", "ings", "ing", "ness", "ments", "ment", "ive", "ly", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            if suf == "s" and w.endswith("ss"):
                return w
            w = w[: -len(suf)]
            if suf in ("ing", "ed", "ings") and len(w) > 3 and w[-1] == w[-2] and w[-1] not in "lsz":
                w = w[:-1]
            return w
    return w


def tokenise(text: str) -> List[str]:
    return TOKEN_RE.findall(normalise(text))


def content_stems(text: str) -> List[str]:
    return [stem(t) for t in tokenise(text) if t not in STOPWORDS and len(t) > 1]


def split_sentences(text: str) -> List[str]:
    return [s.strip() for s in SENT_RE.split((text or "").strip()) if s.strip()]


THEMES: Dict[str, Dict] = {
    "difficulty_effort": ("Perceived difficulty or effort", "hard difficult demanding effort struggle challenging tiring exhausting intense overwhelming busy cluttered complex confusing tough"),
    "ease_calm": ("Ease or calm", "easy calm relaxed simple smooth comfortable relaxing effortless clear focused manageable"),
    "distraction": ("Distraction or interference", "distract flicker flashing noise noisy beep interrupt annoying irritating moving cluttered busy"),
    "time_pressure": ("Time pressure or speed", "fast quick rushed hurry pressure speed deadline time rapid"),
    "visual": ("Visual content", "screen colour color shape flash bright dark visual light diamond circle"),
    "audio": ("Auditory content", "sound beep tone audio noise loud hear click"),
    "fatigue_boredom": ("Fatigue or boredom", "tired bored boring sleepy repetitive long dull"),
    "negative_affect_words": ("Negative-affect words", "frustrated annoyed anxious stressed nervous worried irritated upset tense stress frustrating"),
    "positive_affect_words": ("Positive-affect words", "enjoyed fun interesting engaging pleasant satisfying good great happy liked nice"),
}
THEME_STEMS = {k: {stem(w) for w in v[1].split()} for k, v in THEMES.items()}
NEG_WORDS = THEME_STEMS["negative_affect_words"] | {stem(w) for w in "hard difficult frustrating annoying tiring confusing overwhelming exhausting bad worse awful".split()}
POS_WORDS = THEME_STEMS["positive_affect_words"] | {stem(w) for w in "easy calm relaxed smooth comfortable better fine".split()}


def preprocess(text: str) -> Dict:
    raw = text or ""
    norm = normalise(raw)
    toks = TOKEN_RE.findall(norm)
    rows = [{"text": t, "stem": stem(t), "stopword": t in STOPWORDS} for t in toks]
    kept = [r["stem"] for r in rows if not r["stopword"] and len(r["text"]) > 1]
    n_punct = len(re.findall(r"[^\w\s']", norm))
    steps = [
        {"name": "Unicode + case normalisation", "detail": "NFKC unicode form, curly apostrophes straightened, lower-cased, URLs removed, whitespace collapsed."},
        {"name": "Tokenisation", "detail": f"Regular expression [a-z]+('[a-z]+)? | numbers. Punctuation is discarded ({n_punct} punctuation marks removed)."},
        {"name": "Stop-word handling", "detail": f"{sum(r['stopword'] for r in rows)} of {len(rows)} tokens matched a {len(STOPWORDS)}-word English stop list and are excluded from TF-IDF/retrieval (kept for linguistic features)."},
        {"name": "Light stemming", "detail": "Crude suffix stripping (-ing, -ed, -ion, -ly, plural -s ...) so that related word forms share one TF-IDF dimension. Not Porter; some conflations are imperfect."},
    ]
    return {"raw": raw, "normalised": norm, "tokens": rows, "content_stems": kept, "steps": steps}


def linguistic_features(text: str) -> Dict:
    toks = tokenise(text)
    sents = split_sentences(text) or ([text.strip()] if text.strip() else [])
    n = len(toks)
    uniq = len(set(toks))
    return {
        "characters": len(text or ""),
        "tokens": n,
        "sentences": len(sents),
        "mean_sentence_length_tokens": round(n / len(sents), 2) if sents else 0,
        "mean_word_length": round(sum(len(t) for t in toks) / n, 2) if n else 0,
        "type_token_ratio": round(uniq / n, 3) if n else 0,
        "first_person_rate": round(sum(t in FIRST_PERSON for t in toks) / n, 3) if n else 0,
        "negation_count": sum(t in NEGATIONS or t.endswith("n't") for t in toks),
        "question_marks": (text or "").count("?"),
        "exclamation_marks": (text or "").count("!"),
    }


def themes_and_polarity(text: str) -> Dict:
    toks = tokenise(text)
    stems_ = [stem(t) for t in toks]
    themes = []
    for key, (label, _) in THEMES.items():
        hits = [t for t, s in zip(toks, stems_) if s in THEME_STEMS[key]]
        if hits:
            themes.append({"id": key, "label": label, "count": len(hits), "matched_words": sorted(set(hits))})
    themes.sort(key=lambda x: -x["count"])
    pos = neg = 0
    for i, s in enumerate(stems_):
        flip = any(t in NEGATIONS or t.endswith("n't") for t in toks[max(0, i - 2): i])
        if s in POS_WORDS:
            pos, neg = (pos, neg + 1) if flip else (pos + 1, neg)
        elif s in NEG_WORDS:
            pos, neg = (pos + 1, neg) if flip else (pos, neg + 1)
    pol = round((pos - neg) / (pos + neg), 3) if (pos + neg) else None
    return {
        "themes": themes,
        "lexicon_polarity": {"positive_hits": pos, "negative_hits": neg, "score": pol,
                             "interpretation": "No lexicon words found" if pol is None else
                             ("leans positive" if pol > 0.2 else "leans negative" if pol < -0.2 else "mixed / neutral")},
        "limitations": ("Lexicon counts over a ~100-word hand-written list with 2-token negation handling. Not validated, "
                        "blind to sarcasm and context, and NOT a measure of stress, mood, or any health condition."),
    }
