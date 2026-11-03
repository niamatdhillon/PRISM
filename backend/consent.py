"""Consent text shown to participants. Changing the text requires bumping CONSENT_VERSION (the SHA-256 is stored with each consent)."""
import hashlib

CONSENT_VERSION = "v1.0"
CONSENT_PARAGRAPHS = [
    "PRISM is a research platform studying how sensory conditions relate to attention, task performance and self-reported workload and stress. It is not a medical, diagnostic or clinical test and cannot tell you anything about your health.",
    "You will complete short computer tasks (e.g. visual search, tone detection, arrow and shape judgements, arithmetic, pattern completion) and answer rating questions. Some tasks can use your device's camera as a visual backdrop and sound. The camera is optional, is processed only inside your browser, and no video or images are recorded, stored or uploaded.",
    "What we store: a random pseudonymous participant code, your responses, reaction times, task conditions, ratings, a coarse device type (phone/tablet/desktop) and display mode, timestamps, and an optional written reflection. We do not collect your name, email address, IP address, location, camera images or microphone audio.",
    "Use of your data: statistical analysis of task performance, and (for the optional reflection) text analysis. Data is accessible only to authorised researchers. Results are reported in aggregate. Language and performance analyses are exploratory and are never used to diagnose stress, cognitive impairment or any condition.",
    "You must be 18 or over. Taking part is voluntary. You can stop at any time. In 'My data' you can view, download and delete everything linked to your participant code, or withdraw, which deletes all your task data and reflections. Only a minimal record that consent was given and withdrawn is kept for research-governance purposes.",
    "Safety: the 'distraction' condition can include flickering light. Do not take part if flickering light may trigger photosensitive symptoms. Do not use the camera or AR mode while walking or driving, and take care of your surroundings.",
]
CONSENT_TEXT = "\n\n".join(CONSENT_PARAGRAPHS)
CONSENT_SHA256 = hashlib.sha256(CONSENT_TEXT.encode()).hexdigest()
