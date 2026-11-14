"""Regenerates es_core/data/exercises.json and load_matrix.placeholder.json.

The loads below are a priori guesses from the task type (what the task asks the person to do).
They are NOT TRIBE v2 output. When the real matrix exists, drop a file in the same format
(source other than "placeholder, not TRIBE v2") and point ES_LOAD_MATRIX at it.

Columns: memory, word, phrase, attn, speed (speed = proxy of stimulus tempo, see README).
"""
import json
from pathlib import Path

D = ("episodic_memory", "word_access", "phrase_building", "attention", "processing_speed")
# id, kind, channel, minutes, measures, title_ru, loads(mem, word, phrase, attn, speed)
L = [
    ("story_retell", "story_retell", "speech", 4, True, "Пересказ рассказа", (.9, .4, .6, .3, .1)),
    ("picture_description", "picture_description", "speech", 2, True, "Описание картинки", (.2, .7, .8, .4, .3)),
    ("naming_fluency", "naming_fluency", "speech", 1, True, "Называние животных за минуту", (.2, .9, .1, .4, .6)),
    ("word_list_recall_spoken", "recall", "speech", 3, False, "Вспомнить список слов вслух", (.8, .5, .1, .4, .2)),
    ("naming_from_definition", "naming", "speech", 3, False, "Назвать предмет по описанию", (.3, .9, .3, .3, .3)),
    ("picture_naming", "naming", "speech", 3, False, "Назвать предмет на картинке", (.2, .9, .1, .3, .4)),
    ("sentence_completion_spoken", "phrase", "speech", 3, False, "Закончить фразу вслух", (.2, .6, .8, .3, .3)),
    ("describe_daily_routine", "phrase", "speech", 3, False, "Рассказать про привычный день", (.5, .6, .8, .3, .2)),
    ("read_aloud_short_text", "phrase", "speech", 2, False, "Прочитать короткий текст вслух", (.1, .5, .5, .4, .5)),
    ("sentence_building_cards", "phrase", "reading", 3, False, "Собрать фразу из карточек", (.2, .3, .8, .3, .2)),
    ("word_picture_matching", "naming", "auditory_visual", 2, False, "Услышать слово и выбрать картинку", (.2, .6, .1, .4, .5)),
    ("sound_to_picture", "naming", "auditory_visual", 2, False, "Услышать звук и выбрать картинку", (.2, .4, .0, .5, .5)),
    ("odd_one_out", "semantic", "visual", 2, False, "Найти лишнее", (.1, .5, .1, .4, .4)),
    ("picture_pair_memory", "memory_visual", "visual", 3, False, "Найти пары картинок", (.8, .05, .0, .4, .2)),
    ("spatial_sequence_recall", "memory_spatial", "spatial", 3, False, "Повторить последовательность на поле", (.8, .0, .0, .5, .2)),
    ("delayed_picture_recognition", "memory_visual", "visual", 3, False, "Узнать картинки, показанные раньше", (.8, .05, .0, .2, .1)),
    ("route_recall_map", "memory_spatial", "spatial", 3, False, "Вспомнить маршрут на карте", (.7, .0, .0, .4, .2)),
    ("face_name_choice", "memory_visual", "visual", 3, False, "Сопоставить лицо и имя (выбор из вариантов)", (.8, .3, .0, .3, .1)),
    ("shopping_list_recall_visual", "memory_visual", "visual", 3, False, "Вспомнить покупки по картинкам", (.8, .2, .0, .3, .1)),
    ("digit_span_tap", "memory_spatial", "visual", 2, False, "Повторить ряд цифр нажатиями", (.7, .0, .0, .6, .2)),
    ("spot_the_difference", "attention", "visual", 3, False, "Найти отличия", (.1, .0, .0, .8, .4)),
    ("sustained_tone_detection", "attention", "auditory", 3, False, "Заметить редкий сигнал", (.0, .0, .0, .9, .5)),
    ("card_sorting", "attention", "visual", 3, False, "Разложить карточки по правилу", (.2, .1, .0, .6, .6)),
    ("rhythm_copy", "attention", "auditory_motor", 2, False, "Повторить ритм", (.5, .0, .0, .6, .4)),
    ("reaction_tap", "speed", "motor", 2, False, "Быстро нажать на цель", (.0, .0, .0, .5, .9)),
]

exercises = []
loads = {}
for id_, kind, ch, mins, meas, title, v in L:
    exercises.append({
        "id": id_, "kind": kind, "channel": ch, "duration_min": mins,
        "measures": meas, "speech_output": ch == "speech", "title_ru": title,
    })
    loads[id_] = dict(zip(D, v))

out = Path(__file__).resolve().parent.parent / "es_core" / "data"
(out / "exercises.json").write_text(json.dumps({"exercises": exercises}, ensure_ascii=False, indent=1) + "\n")
(out / "load_matrix.placeholder.json").write_text(json.dumps({
    "source": "placeholder, not TRIBE v2",
    "label_ru": "Предварительная нагрузка по типу задания, не результат TRIBE v2",
    "model_version": None,
    "atlas": None,
    "domains": list(D),
    "domain_notes": {
        "processing_speed": "proxy of stimulus tempo, not a brain-based value",
        "episodic_memory": "low reliability in TRIBE v2; profile uses behavioural retell metrics",
    },
    "loads": loads,
}, ensure_ascii=False, indent=1) + "\n")
print(len(exercises), "exercises")
