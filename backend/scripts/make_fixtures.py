"""Writes tests/fixtures/*.json: transcripts with word timings (no audio, no model)."""
import json
from pathlib import Path

from es_core.synthetic import timed
from es_core.stories import STORY_EN, STORY_RU

out = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
out.mkdir(exist_ok=True)


def save(name, tr):
    (out / f"{name}.json").write_text(json.dumps(tr.to_dict(), ensure_ascii=False, indent=1) + "\n")


EN_FLUENT = ("there is a woman standing at the kitchen sink and the water is running over because she is "
             "not watching it. The boy is on a stool reaching for the cookie jar while his sister waits. "
             "A dog sits by the window and the curtains move in the wind.")
save("picture_en_fluent", timed(EN_FLUENT, wps=2.6, gap_after={12: 0.3, 26: 0.4}, start=1.0))

EN_HESITANT = ("the um woman is the woman is at the uh sink and the thing is the water is going on the "
               "floor and she she is not looking. The boy is on the on the thing for the the cookies.")
toks = EN_HESITANT.split()
gaps = {i: 1.4 for i, t in enumerate(toks) if t in ("woman", "sink", "thing", "floor", "boy", "cookies")}
save("picture_en_hesitant", timed(EN_HESITANT, wps=1.4, gap_after=gaps, start=3.6))

RU_PICT = ("женщина стоит у раковины и вода льется через край потому что она не смотрит. "
           "Мальчик стоит на стуле и тянется к банке с печеньем, а сестра ждет.")
save("picture_ru", timed(RU_PICT, wps=2.2, start=1.2, language="ru"))

EN_ANIMALS = ("dog cat horse cow pig sheep lion tiger elephant giraffe zebra monkey bear wolf fox "
              "cat rabbit mouse bird fish")
t_en = timed(EN_ANIMALS, wps=0.35, start=1.0, language="en")  # about 20 words over ~57 s
save("animals_en", t_en)

RU_ANIMALS = "собака кошка лошадь корова свинья лев тигр слон волк лиса медведь заяц кошка мышь"
save("animals_ru", timed(RU_ANIMALS, wps=0.25, start=2.0, language="ru"))

full_en = STORY_EN.text
save("retell_en_immediate", timed(" ".join(full_en.split()[:70]), wps=2.5))
save("retell_en_delayed", timed("Maria kept the lamp at the harbor and one stormy night a boat lost its way. "
                                "She rang a bell and a baker helped pull the boat in. Tomas gave her his scarf.",
                                wps=2.0))
save("retell_ru_immediate", timed(STORY_RU.text, wps=2.5, language="ru"))
save("retell_ru_delayed", timed("Садовник Мирас посадил яблоню весной. Айгуль помогла перевязать ветку. "
                                "Осенью созрели три яблока.", wps=2.0, language="ru"))
print(sorted(p.name for p in out.glob("*.json")))
