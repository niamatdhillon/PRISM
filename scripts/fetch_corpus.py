"""Fetch real abstracts + metadata for the curated PRISM corpus.

Sources: Europe PMC REST API (PubMed records) and the arXiv API.
Only titles, authors, venue, year, DOI/URL and the publisher/author-supplied
abstract are stored -- no full text, no paraphrase. Run: python scripts/fetch_corpus.py
"""
import json, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "backend" / "data" / "corpus_raw.json"
PMIDS = {
    "lavie2005": "15668100", "stein2008": "18354398", "spence2011": "21264748",
    "ernst2002": "11807554", "alais2004": "14761661", "shams2008": "18805039",
    "szalma2011": "21707130", "diederich2004": "15813202", "heitz2014": "24966810",
    "hultsch2002": "11867658", "chancellor2020": "32219184", "haynes2017": "28462758", "mokhtarinia2026": "42472874",
}
ARXIV = {"lewis2020": "2005.11401", "reimers2019": "1908.10084", "karpukhin2020": "2004.04906"}
TOPIC = {
    "lavie2005": "attention", "stein2008": "multisensory", "spence2011": "multisensory",
    "ernst2002": "multisensory", "alais2004": "multisensory", "shams2008": "multisensory",
    "szalma2011": "stress", "diederich2004": "multisensory", "heitz2014": "behavioural-measurement",
    "hultsch2002": "cognitive-health", "haynes2017": "cognitive-health", "mokhtarinia2026": "workload", "chancellor2020": "nlp-mental-health",
    "lewis2020": "rag", "reimers2019": "nlp-methods", "karpukhin2020": "nlp-methods",
}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "PRISM-research/0.1 (corpus builder)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def clean(t):
    t = re.sub(r"<[^>]+>", " ", t or "")
    return re.sub(r"\s+", " ", t).strip()

docs = []
for key, pmid in PMIDS.items():
    u = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urllib.parse.urlencode(
        {"query": f"EXT_ID:{pmid} AND SRC:MED", "format": "json", "resultType": "core"})
    res = json.loads(get(u))["resultList"]["result"]
    if not res:
        print("NOT FOUND", key, pmid, file=sys.stderr); continue
    r = res[0]
    docs.append({
        "id": key, "title": clean(r.get("title")), "authors": r.get("authorString", ""),
        "venue": r.get("journalInfo", {}).get("journal", {}).get("title", r.get("journalTitle", "")),
        "year": int(r.get("pubYear", 0) or 0), "doi": r.get("doi"), "pmid": pmid,
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "license": "Abstract from PubMed/Europe PMC; copyright remains with the publisher/authors",
        "topic": TOPIC[key], "abstract": clean(r.get("abstractText")), "source_api": "Europe PMC",
    })
    time.sleep(0.3)

ns = {"a": "http://www.w3.org/2005/Atom"}
for key, aid in ARXIV.items():
    root = ET.fromstring(get(f"http://export.arxiv.org/api/query?id_list={aid}"))
    e = root.find("a:entry", ns)
    docs.append({
        "id": key, "title": clean(e.find("a:title", ns).text),
        "authors": ", ".join(a.find("a:name", ns).text for a in e.findall("a:author", ns)),
        "venue": f"arXiv:{aid}", "year": int(e.find("a:published", ns).text[:4]), "doi": None, "pmid": None,
        "url": f"https://arxiv.org/abs/{aid}", "license": "arXiv abstract; see arXiv for paper licence",
        "topic": TOPIC[key], "abstract": clean(e.find("a:summary", ns).text), "source_api": "arXiv",
    })
    time.sleep(3)

OUT.write_text(json.dumps(docs, indent=1, ensure_ascii=False))
for d in docs:
    print(d["id"], d["year"], "|", d["title"][:80], "| abs chars:", len(d["abstract"]))
