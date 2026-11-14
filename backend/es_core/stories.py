"""Two original short stories (en, ru) with marked meaning units.

A unit is matched when one of its alternatives has every stem present (token prefix match)
inside a small window of the retelling. Stems are lower-case, "ё" is written as "е".
Both stories are original texts written for Siriva.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Unit:
    id: str
    label: str
    alternatives: tuple[tuple[str, ...], ...]


@dataclass(frozen=True)
class Story:
    id: str
    language: str
    title: str
    text: str
    units: tuple[Unit, ...]


def _u(i: int, label: str, *alts: list[str]) -> Unit:
    return Unit(f"u{i:02d}", label, tuple(tuple(a) for a in alts))


STORY_EN = Story(
    id="lantern-keeper-en",
    language="en",
    title="The Lantern Keeper",
    text=(
        "Maria kept the lamp at the old harbor. Every evening she climbed forty steps to light it. "
        "One stormy night a small fishing boat lost its way. The boy on board, named Tomas, held a "
        "red scarf. Maria saw the boat from her window and rang the big bell. She also waved the "
        "lamp three times. The fishermen turned toward the rocks on the left, but the waves pushed "
        "them back. So Maria ran down to the pier with a rope. Her neighbor, a baker named Oleg, "
        "helped her pull the boat in. Everyone was cold, so they went to the bakery for hot bread "
        "and soup. In the morning the sea was calm. Tomas gave his scarf to Maria as a thank you. "
        "She tied it to the lamp, and it stayed there for many years."
    ),
    units=(
        _u(1, "keeper named Maria", ["maria"]),
        _u(2, "old harbor", ["harbo"], ["port"]),
        _u(3, "lamp", ["lamp"], ["lantern"], ["lighthouse"]),
        _u(4, "every evening", ["every", "evening"], ["each", "evening"], ["daily"]),
        _u(5, "forty steps", ["forty"], ["40"], ["steps"], ["stairs"]),
        _u(6, "stormy night", ["storm"]),
        _u(7, "small fishing boat", ["boat"], ["ship"]),
        _u(8, "lost its way", ["lost"], ["lose"], ["off", "course"]),
        _u(9, "boy named Tomas", ["tomas"], ["boy"]),
        _u(10, "red scarf", ["scarf"]),
        _u(11, "saw from the window", ["window"]),
        _u(12, "rang the bell", ["bell"]),
        _u(13, "waved the lamp three times", ["three"], ["waved"], ["3"]),
        _u(14, "rocks on the left", ["rocks"]),
        _u(15, "waves pushed them back", ["waves"], ["pushed"]),
        _u(16, "ran to the pier with a rope", ["rope"]),
        _u(17, "pier", ["pier"], ["dock"]),
        _u(18, "neighbor baker Oleg", ["baker"], ["oleg"]),
        _u(19, "pulled the boat in", ["pull"]),
        _u(20, "everyone was cold", ["cold"]),
        _u(21, "bread and soup at the bakery", ["bread"], ["soup"]),
        _u(22, "calm morning", ["calm"], ["morning"]),
        _u(23, "scarf given as thanks", ["thank"], ["gave", "scarf"]),
        _u(24, "tied to the lamp, many years", ["tied"], ["years"]),
    ),
)

STORY_RU = Story(
    id="apple-tree-ru",
    language="ru",
    title="Яблоня Мираса",
    text=(
        "Старый садовник Мирас жил на краю села. Весной он посадил яблоню у забора. Каждое утро "
        "он носил к ней два ведра воды. Соседская девочка Айгуль спросила, зачем так много. "
        "Мирас ответил, что деревья любят терпение. Летом налетел сильный ветер и сломал одну "
        "ветку. Айгуль принесла бинт и верёвку, и они вместе перевязали ветку. Осенью на яблоне "
        "созрели три яблока. Мирас отдал одно Айгуль, второе отнёс в школу, а третье оставил "
        "себе. Зимой в саду было тихо, под снегом спали корни. Но в марте на сломанной ветке "
        "первой появилась почка."
    ),
    units=(
        _u(1, "садовник Мирас", ["садовник"], ["мирас"]),
        _u(2, "на краю села", ["края"], ["краю"], ["села"], ["селе"], ["деревн"]),
        _u(3, "весной посадил", ["весн"]),
        _u(4, "яблоня", ["яблон"]),
        _u(5, "у забора", ["забор"]),
        _u(6, "каждое утро", ["утр"]),
        _u(7, "два ведра воды", ["ведр"], ["воду"], ["воды"], ["полива"]),
        _u(8, "девочка Айгуль", ["айгул"], ["девочк"]),
        _u(9, "деревья любят терпение", ["терпен"]),
        _u(10, "летом сильный ветер", ["ветер"], ["ветр"]),
        _u(11, "сломал ветку", ["сломал"], ["сломан"], ["поломал"]),
        _u(12, "бинт", ["бинт"]),
        _u(13, "верёвка", ["веревк"]),
        _u(14, "вместе перевязали", ["перевяз"]),
        _u(15, "осенью", ["осен"]),
        _u(16, "три яблока", ["три"], ["трех"]),
        _u(17, "одно отдал Айгуль", ["отдал"]),
        _u(18, "второе отнёс в школу", ["школ"]),
        _u(19, "третье оставил себе", ["себе"], ["оставил"]),
        _u(20, "зимой тихо", ["зим"], ["тих"]),
        _u(21, "под снегом", ["снег"]),
        _u(22, "спали корни", ["корн"]),
        _u(23, "в марте", ["март"]),
        _u(24, "почка на ветке", ["почк"]),
    ),
)

STORIES = {s.id: s for s in (STORY_EN, STORY_RU)}


def get_story(story_id: str) -> Story:
    try:
        return STORIES[story_id]
    except KeyError:
        raise KeyError(f"unknown story: {story_id!r}")
