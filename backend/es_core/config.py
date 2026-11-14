"""All tunable thresholds in one place.

Пересмотреть после калибровки (ADReSS и реальные данные). Сейчас значения подобраны под демо
и не являются нормами.
"""
import os

# profile
REDUCED_THRESHOLD = 45.0        # "lowered": below the reference, a candidate for the target of training
DAMAGED_THRESHOLD = 25.0        # "reduced strongly": the planner avoids loading it, never targets it by default
PROFILE_WINDOW_DAYS = 14        # profile = median of features over this many days

# trend flag for a close person
TREND_MIN_WEEKS = 6
TREND_NORMAL_WEEKLY_SLOPE = -0.1  # reference drift, points per week
TREND_SLOPE_FLAG = -1.0           # points per week, steeper than this
TREND_DELTA_FLAG = -8.0           # last 3 weeks minus first 3 weeks, points
MAX_WEEKS = 26

# planner
LAMBDA = 1.5
DOSE_BUDGET = 18.0
MAX_ITEMS = 6
MIN_ITEM_SCORE = 0.2
MIN_FILL_SCORE = 0.05           # second pass: top up the dose budget with items that still help the target
ACC_LOW, ACC_HIGH = 0.70, 0.80
DIFF_MIN, DIFF_MAX, DEFAULT_DIFFICULTY = 1, 5, 2

# exercises
DELAYED_RETELL_MINUTES = float(os.environ.get("ES_DELAY_MINUTES", "20"))  # shorter only for demos
TRANSCRIBE_TIMEOUT_S = float(os.environ.get("ES_TRANSCRIBE_TIMEOUT", "60"))
FLUENCY_CATEGORIES = ("animals",)
MIN_WORDS_EMPTY = 1             # fewer words than this: silence, nothing is stored (422 empty_audio)
MIN_WORDS_SPEECH = 3            # picture description and retelling: fewer words is too short (422 speech_too_short)

# IRT (Rasch) for difficulty levels
IRT_TARGET_SUCCESS = 0.75       # level with predicted success closest to this
IRT_MIN_RESULTS = 3             # fewer results in the domain: use the 70-80% rule instead (source "rule")

# forgetting model (half-life regression, light): recall p(t) = 2^(-t / half_life)
FORGET_TARGET_RECALL = 0.8      # next review when predicted recall falls to this
FORGET_PRIOR_HALF_LIFE_DAYS = 1.0
FORGET_MIN_HALF_LIFE_DAYS, FORGET_MAX_HALF_LIFE_DAYS = 0.05, 120.0
