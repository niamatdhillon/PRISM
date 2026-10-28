"""Session/trial schema (single source of truth; mirrored in docs/DATA_DICTIONARY.md)."""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, model_validator

Source = Literal["participant", "synthetic"]
Device = Literal["desktop", "tablet", "phone", "unknown"]


class Trial(BaseModel):
    idx: int = Field(ge=0)
    block: int = Field(ge=0, le=3)
    kind: Literal["target", "arithmetic"]
    modality: Literal["visual", "audiovisual", "none"]
    set_size: int = Field(ge=0, le=200)
    target_side: Optional[Literal["left", "right"]] = None
    response: Optional[str] = None
    correct: Optional[bool] = None
    rt_ms: Optional[float] = Field(default=None, ge=0, le=10000)
    timeout: bool = False
    anticipatory: bool = False


class Condition(BaseModel):
    complexity: int = Field(ge=0, le=2, description="0 low (6 items), 1 medium (18), 2 high (36)")
    movement: bool
    distraction: bool
    audio_enabled: bool
    block_modalities: List[Literal["visual", "audiovisual"]]


class Ratings(BaseModel):
    pre_stress: Optional[int] = Field(default=None, ge=0, le=100)
    post_stress: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_mental: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_physical: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_temporal: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_performance: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_effort: Optional[int] = Field(default=None, ge=0, le=100)
    tlx_frustration: Optional[int] = Field(default=None, ge=0, le=100)


class SessionRecord(BaseModel):
    session_id: str = Field(min_length=6, max_length=64)
    participant_id: str = Field(min_length=3, max_length=64)
    source: Source
    consent: bool
    consent_version: str
    created_at: str
    completed_at: Optional[str] = None
    completed: bool = False
    device: Device = "unknown"
    condition: Condition
    ratings: Ratings = Ratings()
    reflection: Optional[str] = Field(default=None, max_length=4000)
    trials: List[Trial] = []

    @model_validator(mode="after")
    def _consent_required(self):
        if self.source == "participant" and not self.consent:
            raise ValueError("participant observations require consent=true")
        return self


def tlx_global(r: Ratings) -> Optional[float]:
    """Raw (unweighted) NASA-TLX: mean of the six subscales, or None if any is missing.
    The performance subscale is anchored perfect(0)..failure(100), as in the original instrument."""
    v = [r.tlx_mental, r.tlx_physical, r.tlx_temporal, r.tlx_performance, r.tlx_effort, r.tlx_frustration]
    return None if any(x is None for x in v) else sum(v) / 6.0
