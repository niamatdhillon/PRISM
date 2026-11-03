"""Request validation for participant-submitted sessions. Strict: unknown tasks, impossible values and inconsistent trials are rejected."""
from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from .protocol import DISPLAY_MODES, PROTOCOL_VERSION, TASKS

TaskId = Literal["visual_search", "auditory_oddball", "task_switching", "flanker", "pattern", "arithmetic"]


class TrialIn(BaseModel):
    idx: int = Field(ge=0, le=500)
    task: TaskId
    block: int = Field(default=0, ge=0, le=3)
    modality: Literal["visual", "audiovisual", "auditory", "none"] = "visual"
    trial_type: Optional[str] = Field(default=None, max_length=24)
    set_size: Optional[int] = Field(default=None, ge=0, le=200)
    stimulus: Optional[str] = Field(default=None, max_length=40)
    response: Optional[str] = Field(default=None, max_length=40)
    correct: Optional[bool] = None
    rt_ms: Optional[float] = Field(default=None, ge=0, le=15000)
    onset_epoch_ms: Optional[float] = Field(default=None, ge=0)
    timeout: bool = False
    anticipatory: bool = False

    @model_validator(mode="after")
    def _consistent(self):
        spec = TASKS[self.task]
        if spec["trial_types"] and self.trial_type not in spec["trial_types"]:
            raise ValueError(f"{self.task}: trial_type must be one of {spec['trial_types']}")
        if self.timeout and self.rt_ms is not None:
            raise ValueError("a timed-out trial cannot have an RT")
        if self.task != "auditory_oddball" and self.response is None and not self.timeout:
            raise ValueError("a trial without a response must be flagged timeout")
        return self


class Condition(BaseModel):
    complexity: int = Field(ge=0, le=2)
    movement: bool
    distraction: bool
    brightness: float = Field(default=1.0, ge=0.2, le=1.0)
    block_modalities: List[Literal["visual", "audiovisual"]] = Field(default_factory=lambda: ["visual", "visual"], max_length=2)


class Ratings(BaseModel):
    pre_stress: Optional[int] = Field(default=None, ge=0, le=100)
    post_stress: Optional[int] = Field(default=None, ge=0, le=100)
    perceived_difficulty: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_mental: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_physical: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_temporal: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_performance: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_effort: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_frustration: Optional[int] = Field(default=None, ge=0, le=100)


class Timing(BaseModel):
    median_frame_ms: Optional[float] = Field(default=None, ge=0, le=1000)
    viewport: Optional[str] = Field(default=None, max_length=20)


class SessionIn(BaseModel):
    session_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    protocol_version: str = PROTOCOL_VERSION
    started_at: datetime
    completed_at: Optional[datetime] = None
    completed: bool = False
    device: Literal["desktop", "tablet", "phone", "unknown"] = "unknown"
    display_mode: Literal["canvas2d", "scene3d", "camera_overlay", "webxr"]
    camera_used: bool = False
    audio_enabled: bool = False
    condition: Condition
    tasks_completed: List[TaskId] = Field(min_length=1)
    ratings: Ratings = Ratings()
    timing: Timing = Timing()
    reflection: Optional[str] = Field(default=None, max_length=4000)
    trials: List[TrialIn] = Field(max_length=400)

    @field_validator("tasks_completed")
    @classmethod
    def _unique(cls, v):
        if len(set(v)) != len(v):
            raise ValueError("duplicate tasks")
        return v

    @model_validator(mode="after")
    def _check(self):
        if self.display_mode == "camera_overlay" and not self.camera_used:
            raise ValueError("display_mode camera_overlay requires camera_used=true")
        idxs = [t.idx for t in self.trials]
        if len(set(idxs)) != len(idxs):
            raise ValueError("duplicate trial idx")
        counts: Dict[str, int] = {}
        for t in self.trials:
            if t.task not in self.tasks_completed:
                raise ValueError(f"trial for task {t.task} not in tasks_completed")
            counts[t.task] = counts.get(t.task, 0) + 1
        for task, n in counts.items():
            if n > TASKS[task]["max_trials"]:
                raise ValueError(f"too many trials for {task}")
        if self.completed and self.completed_at is None:
            raise ValueError("completed sessions need completed_at")
        if self.completed_at and self.completed_at < self.started_at:
            raise ValueError("completed_at precedes started_at")
        return self


class EnrollIn(BaseModel):
    consent: bool
    consent_version: str
    age_confirmed_18_plus: bool


class RestoreIn(BaseModel):
    recovery_code: str = Field(min_length=20, max_length=100)


class LoginIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)
