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
    lem = lemmatise([r["text"] for r in rows])
    for r, l in zip(rows, lem):
        r["lemma"] = l
    steps.append({"name": "Lemmatisation", "detail": "Dictionary lemmas (simplemma) are shown per token for interpretation; TF-IDF uses the light stems above."})
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


# ---------------------------------------------------------------- v2 additions: lemmas, VADER, keywords, themes
def lemmatise(tokens: List[str]) -> List[str]:
    """Dictionary-based lemmatisation (simplemma, English). Falls back to the token itself if the library is missing."""
    try:
        import simplemma
        return [simplemma.lemmatize(t, lang="en") for t in tokens]
    except Exception:  # noqa: BLE001
        return list(tokens)


def vader_sentiment(text: str) -> Dict:
    """VADER (Hutto & Gilbert 2014) lexicon sentiment on the RAW text. Describes the wording only; NOT a measure of stress or mood."""
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        s = SentimentIntensityAnalyzer().polarity_scores(text or "")
        label = "positive wording" if s["compound"] >= 0.05 else "negative wording" if s["compound"] <= -0.05 else "neutral wording"
        return {"available": True, "compound": s["compound"], "pos": s["pos"], "neu": s["neu"], "neg": s["neg"], "label": label,
                "caveat": "Lexicon-based and tuned on social-media text; blind to sarcasm/context. Describes word choice only - not stress, mood or any health condition."}
    except Exception as e:  # noqa: BLE001
        return {"available": False, "reason": f"vaderSentiment not installed ({type(e).__name__})"}


def extract_keywords(text: str, k: int = 8) -> List[Dict]:
    """RAKE-style keyphrases: candidate phrases are maximal runs of non-stop-words; scored by sum of word degree/frequency."""
    toks = TOKEN_RE.findall(normalise(text))
    phrases, cur = [], []
    for t in toks:
        if t in STOPWORDS or len(t) < 2:
            if cur:
                phrases.append(cur); cur = []
        else:
            cur.append(t)
    if cur:
        phrases.append(cur)
    freq, deg = {}, {}
    for ph in phrases:
        for w in ph:
            freq[w] = freq.get(w, 0) + 1; deg[w] = deg.get(w, 0) + len(ph) - 1
    scored = {}
    for ph in phrases:
        scored[" ".join(ph)] = sum((deg[w] + freq[w]) / freq[w] for w in ph)
    return [{"phrase": p, "score": round(s, 2)} for p, s in sorted(scored.items(), key=lambda kv: (-kv[1], kv[0]))[:k]]


def corpus_themes(texts: List[str], n_topics: int = 3, n_terms: int = 6, min_docs: int = 10) -> Dict:
    """NMF topic model over REAL reflections. Refuses to run on fewer than `min_docs` documents (topics from tiny samples are noise)."""
    docs = [t for t in texts if t and len(tokenise(t)) >= 5]
    if len(docs) < min_docs:
        return {"status": "insufficient_data", "n_documents": len(docs), "needed": min_docs,
                "message": f"Theme modelling needs >= {min_docs} reflections of >= 5 words; only {len(docs)} available. No topics are shown."}
    from sklearn.decomposition import NMF
    from sklearn.feature_extraction.text import TfidfVectorizer
    vec = TfidfVectorizer(analyzer=content_stems, min_df=2, sublinear_tf=True)
    X = vec.fit_transform(docs)
    if X.shape[1] < n_topics + 1:
        return {"status": "insufficient_data", "n_documents": len(docs), "message": "Too little shared vocabulary across reflections for topic modelling."}
    k = min(n_topics, X.shape[0] - 1)
    nmf = NMF(n_components=k, random_state=0, init="nndsvda", max_iter=500).fit(X)
    terms = vec.get_feature_names_out()
    return {"status": "ok", "n_documents": len(docs), "topics": [{"topic": i + 1, "top_terms": [terms[j] for j in comp.argsort()[::-1][:n_terms]]} for i, comp in enumerate(nmf.components_)],
            "note": "Unsupervised and exploratory; topic labels are for a human to interpret."}
