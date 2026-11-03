"""Experimental protocol catalogue: objective, variables and procedure for every task. Served to the UI and the Method page so the
documentation shown to participants/researchers is the same structure the validator enforces."""
PROTOCOL_VERSION = "2.0.0"

TASKS = {
    "visual_search": {
        "title": "Spatial visual search", "module": "Workload & attention / Multisensory",
        "objective": "Measure how visual complexity, motion, distraction, brightness and an added auditory cue affect speed and accuracy of finding a target.",
        "independent": ["complexity (6/18/36 items)", "movement (static/drifting)", "distraction (none/flicker)", "brightness", "cue modality (visual / audiovisual, within-session)", "display mode (3D scene / camera overlay / WebXR / 2D canvas)"],
        "dependent": ["reaction time (correct trials)", "accuracy", "timeouts", "RT variability (SD, CV)"],
        "procedure": "Find the bright cyan octahedron among cyan spheres and violet octahedra (conjunction search) and report whether it is on the left or right. 3 practice trials (not recorded), then 2 blocks x 12 trials. With sound enabled one block adds a short tone at target onset (order randomised).",
        "measures": "Reaction time estimates processing + decision + motor time. Set-size effects index search efficiency; the audiovisual contrast probes redundant-signal gains.",
        "practice": 3, "trials": 24, "trial_types": [], "max_trials": 24,
    },
    "auditory_oddball": {
        "title": "Auditory attention (tone detection)", "module": "Auditory attention / Multisensory",
        "objective": "Measure sustained auditory attention and sensitivity to rare deviant sounds.",
        "independent": ["deviant probability (25%)", "volume (self-set)"],
        "dependent": ["hit rate", "false-alarm rate", "d-prime (signal-detection sensitivity)", "RT on hits"],
        "procedure": "A stream of 100 ms tones plays: standard 440 Hz and deviant 660 Hz (25%). Press the button (or space) only for the higher deviant tone. 4 practice tones, then 40 recorded tones. Requires working audio.",
        "measures": "d-prime separates sensitivity from response bias; hits/false alarms show detection and impulsivity.",
        "practice": 4, "trials": 40, "trial_types": ["standard", "deviant"], "max_trials": 40,
    },
    "task_switching": {
        "title": "Cognitive flexibility (task switching)", "module": "Workload / Cognitive flexibility",
        "objective": "Measure the cost of switching between two classification rules.",
        "independent": ["trial type (repeat vs switch relative to the previous cue)", "rule (colour vs shape)"],
        "dependent": ["switch cost in RT (switch minus repeat)", "switch cost in accuracy"],
        "procedure": "A cue says COLOUR or SHAPE, then a cyan/violet circle/diamond appears. Report its colour or its shape according to the cue. 4 practice trials, then 32 recorded trials (~50% switches).",
        "measures": "Switch cost indexes executive control / cognitive flexibility (cf. Monsell 2003 review).",
        "practice": 4, "trials": 32, "trial_types": ["repeat", "switch", "first"], "max_trials": 32,
    },
    "flanker": {
        "title": "Distraction resistance (flanker)", "module": "Attention / Distraction",
        "objective": "Measure interference from irrelevant flanking stimuli.",
        "independent": ["congruency (flankers point the same way as the centre arrow or the opposite way)"],
        "dependent": ["congruency effect in RT", "congruency effect in accuracy"],
        "procedure": "A row of five arrows is shown. Report the direction of the CENTRE arrow only. 4 practice trials, then 32 recorded trials (50% incongruent).",
        "measures": "The incongruent-minus-congruent difference quantifies how much irrelevant information interferes with selective attention (Eriksen flanker paradigm).",
        "practice": 4, "trials": 32, "trial_types": ["congruent", "incongruent"], "max_trials": 32,
    },
    "pattern": {
        "title": "Pattern recognition", "module": "Workload / Reasoning",
        "objective": "Measure accuracy and speed of inferring a rule in a short sequence.",
        "independent": ["rule type (arithmetic progression, alternation, repeating cycle)"],
        "dependent": ["accuracy", "response time"],
        "procedure": "A sequence of numbers is shown with the last item missing. Pick the correct next item from four options. 2 practice items, then 8 recorded items.",
        "measures": "Accuracy and latency of rule induction under the chosen sensory condition.",
        "practice": 2, "trials": 8, "trial_types": ["progression", "alternation", "cycle"], "max_trials": 8,
    },
    "arithmetic": {
        "title": "Mental arithmetic", "module": "Workload",
        "objective": "A secondary cognitive load task with objective accuracy and latency.",
        "independent": ["none (fixed difficulty)"],
        "dependent": ["accuracy", "response time"],
        "procedure": "Six sums are shown (e.g. 23 + 14 = 38). Judge whether each is True or False.",
        "measures": "Accuracy and RT on a standard mental-arithmetic judgement.",
        "practice": 0, "trials": 6, "trial_types": [], "max_trials": 6,
    },
}
RATING_FIELDS = ["pre_stress", "post_stress", "perceived_difficulty", "tlx_mental", "tlx_physical", "tlx_temporal", "tlx_performance", "tlx_effort", "tlx_frustration"]
DISPLAY_MODES = ["canvas2d", "scene3d", "camera_overlay", "webxr"]
