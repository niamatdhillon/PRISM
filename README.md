🔺 **PRISM**
Understand the signals. Explore the patterns. Ground the insight in evidence.

PRISM is a research workspace for studying how sensory conditions affect attention, workload and stress. It combines an interactive 3D lab with real-data machine learning and a source-grounded NLP and RAG assistant.

✨ **What is PRISM?**

PRISM helps researchers run sensory tasks, analyse the results and connect participants' reflections to published evidence. Users can try tasks, explore the 3D and camera environments, ask scientific questions and inspect the sources behind every answer.

PRISM brings together:

* 🧪 **Sensory Lab**: Six tasks (visual search, auditory oddball, task switching, flanker, pattern recognition and arithmetic) with NASA-TLX and stress ratings.
* 🥽 **3D & Camera Environments**: A Three.js scene with an optional live camera feed, and WebXR AR on supported devices.
* 🧠 **Predictive Analytics**: A subject-grouped machine learning model trained on a real public PhysioNet EEG dataset.
* 🔎 **NLP Laboratory**: Lemmatisation, TF-IDF, keyphrases, sentiment and theme analysis.
* 💬 **Evidence Q&A**: Ask a scientific question and get cited answers from 26 verified papers.
* 🛠️ **Researcher Workspace**: Protected analytics, participant management, dataset and model settings.
* 👤 **Participant Controls**: Pseudonymous IDs, with the ability to view, download, delete or withdraw data.

🚀 **The Vision**

Sensory research, language tools and machine learning are usually separate. PRISM explores how they can work in one system, where results are tied to real data and answers are tied to their sources.

The goal is simple: clearer measurements, honest results and evidence you can inspect.

🧠 **How It Works**

PRISM runs a retrieval-augmented generation (RAG) workflow alongside its research tools:

1. **Collect**: Participants complete tasks and ratings, and the server validates every session.
2. **Chunk**: Papers are split into short overlapping passages.
3. **Index**: Passages are indexed with TF-IDF and MiniLM embeddings.
4. **Retrieve**: A question retrieves the most relevant passages.
5. **Generate**: When a local Ollama model is available, it writes an answer from the retrieved text.
6. **Cite**: Sources and excerpts are shown so the answer can be checked.

When Ollama isn't connected, PRISM shows quoted sentences from the sources instead and labels them as extractive. If the evidence isn't there, it says so.

🎨 **Product Experience**

PRISM has a futuristic chrome-blue look, an interactive 3D prism on the landing page and a hologram you can interact with. Public pages stay separate from the researcher tools, which require sign-in.

🛠️ **Technology Stack**

* **React & TypeScript**: The interface and 3D scenes.
* **Three.js & WebXR**: The 3D, camera and AR environments.
* **FastAPI (Python)**: The API and research logic.
* **PostgreSQL**: Participants, sessions and settings.
* **scikit-learn**: The EEG model and evaluation.
* **ONNX MiniLM**: Semantic search without PyTorch.
* **Ollama**: Optional local language model.

🔬 **Research & Evaluation**

PRISM's EEG model reaches ROC-AUC 0.70 on held-out subjects from the PhysioNet dataset. That is a modest, uncertain result from a single split of 36 subjects. The model for PRISM's own data stays unevaluated until real participants exist.

These checks measure the pipeline and retrieval only. They aren't clinical results. The automated suites cover the backend, frontend and real-browser flows, and can be run with `python -m pytest` and `npm test`.

🚧 **Current Status**

PRISM is a research prototype for academic demonstration. It includes no synthetic research data, and it doesn't diagnose stress or any medical condition.

Participant data collection stays closed until a real ethics approval is recorded, so the lab runs as an unsaved demo. The camera was tested with a simulated device, and WebXR hasn't run on a real device. The public deployment is still in progress.

🌟 **Project Goal**

To show how sensory experiments, rigorously evaluated models and transparent language tools can work together in one system, where every result has a source and every limit is stated.

**PRISM — Understand the signals. Explore the patterns. Ground the insight in evidence.**
