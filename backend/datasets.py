"""Registry of public datasets: verified provenance for the one that is ingested, and an honest list of what was reviewed but NOT used."""
EEGMAT = {
    "slug": "eegmat", "name": "EEG During Mental Arithmetic Tasks (PhysioNet eegmat v1.0.0)",
    "source_url": "https://physionet.org/content/eegmat/1.0.0/", "doi": "10.13026/C2JQ1P",
    "download_url": "https://physionet.org/static/published-projects/eegmat/eeg-during-mental-arithmetic-tasks-1.0.0.zip",
    "publisher": "PhysioNet (MIT Laboratory for Computational Physiology)", "licence": "Open Data Commons Attribution License v1.0 (ODC-By 1.0); attribution required",
    "licence_verified_on": "dataset landing page (physionet.org), checked during ingestion setup",
    "primary_paper": "Zyma I, Tukaev S, Seleznov I, et al. Electroencephalograms during Mental Arithmetic Task Performance. Data 2019;4(1):14. doi:10.3390/data4010014",
    "platform_citation": "Goldberger AL, et al. PhysioBank, PhysioToolkit, and PhysioNet. Circulation 2000;101(23):e215-e220. doi:10.1161/01.CIR.101.23.e215",
    "archive_size_mb": 175.1,
    "participants": "36 subjects (24 'good counters' and 12 'bad counters' per the dataset's subject-info.csv; ages roughly 16-26 including some under-18s, recorded 2010-2012). Verified by counting the files: 36 subjects x 2 recordings = 72 EDF files, all SHA-256 checksums match.",
    "recording": "Neurocom 23-channel system, silver/silver-chloride electrodes, 10/20 scheme, referenced to linked ears, 500 Hz; 19-20 scalp channels were found in the files. Authors state ICA-based artefact removal (eye, muscle, cardiac).",
    "observations": "Per recording: baseline file 182 s (Subject00) and task file 62 s (Subject00). PRISM uses the first 60 s of each as 6 non-overlapping 10 s epochs -> 432 epochs (216 rest, 216 task).",
    "available_features": "Raw EEG time series + subject-info.csv (age, gender, recording year, number of subtractions, count quality). PRISM derives band-power features only.",
    "missing_values": "No NaNs in the derived feature matrix (0 of 12,960 cells).",
    "design": "Per participant: one recording of resting-state background EEG before the task (suffix _1) and one recording during serial mental subtraction (suffix _2).",
    "target": "Cognitive state: rest (0) vs mental-arithmetic workload (1) - an experimentally manipulated condition, NOT a self-reported workload rating.",
    "suitability": ("Suitable for: demonstrating a leakage-safe, subject-grouped physiological workload classification pipeline on real data. "
                    "NOT suitable for: predicting PRISM's behavioural/self-report outcomes (different modality, task and label), or for any clinical inference. "
                    "Results from this dataset describe EEG band-power differences between rest and mental arithmetic in this sample only."),
    "limitations": ["The dataset README says recordings are 60 s artefact-free segments, but baseline files are longer (e.g. 182 s); only the first 60 s are used and artefact status of that window is not independently verified.",
                    "The README mentions a 30 Hz 'high-pass' filter (likely meant low-pass); features are therefore limited to 1-30 Hz.",
                    "Task-vs-rest label confounds workload with any other difference between the two recordings (e.g. eye movements, muscle artefact, order effect: rest is always first).",
                    "Small number of participants; recordings are short; no TLX or stress ratings.", "Pre-processed by the dataset authors; no additional artefact rejection is applied here beyond what the authors did."],
}
REVIEWED_NOT_USED = [
    {"name": "UNIVERSE: unobtrusive measurement of mental workload and stress in uncontrolled environments", "url": "https://zenodo.org/records/10371068", "licence": "CC-BY-4.0", "size": "about 20 GB", "reason": "GB-scale multimodal data; not downloaded. Catalogue metadata only was reviewed."},
    {"name": "EPIStress: multimodal physiological signals for cognitive stress", "url": "https://zenodo.org/records/16407549", "licence": "CC-BY-4.0", "size": "about 7 GB", "reason": "GB-scale; not downloaded. Catalogue metadata only was reviewed."},
    {"name": "MOCAS: multimodal dataset for objective cognitive workload assessment", "url": "https://zenodo.org/records/10396672", "licence": "CC-BY-4.0", "size": "not verified", "reason": "Not downloaded; contents and size were not verified. Candidate for future work."},
    {"name": "Measuring and quantifying mental workload and stress in everyday situations", "url": "https://zenodo.org/records/15681263", "licence": "CC-BY-4.0", "size": "about 1.8 GB", "reason": "Not downloaded; contents not verified."},
    {"name": "MultiPhysio-HRC", "url": "https://zenodo.org/records/18668043", "licence": "CC-BY-4.0", "size": "about 15.7 GB", "reason": "GB-scale industrial HRC data; not downloaded."},
]
