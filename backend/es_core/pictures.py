"""Two original scenes for "describe the picture" with marked meaning units (12-15 each).

Scenes are written for Siriva; they are not copies of Cookie Theft or other published pictures.
A unit is found when one alternative's stems all appear (token prefix match, window 8) in the
description; a stem ending in "$" must match the whole word. "ё" is written as "е".
Keywords exist for ru and en; the language of the speech decides which set is used.
"""
from __future__ import annotations

from dataclasses import dataclass

from .lang import norm_token
from .retell import _alt_matches
from .types import Transcript


@dataclass(frozen=True)
class PUnit:
    id: str
    kind: str  # person, action, object, setting, oddity
    label_ru: str
    label_en: str
    ru: tuple[tuple[str, ...], ...]
    en: tuple[tuple[str, ...], ...]


@dataclass(frozen=True)
class Scene:
    id: str
    title_ru: str
    title_en: str
    image_file: str
    image_prompt: str
    units: tuple[PUnit, ...]


def _u(i, kind, lru, len_, ru, en):
    return PUnit(f"p{i:02d}", kind, lru, len_, tuple(tuple(a) for a in ru), tuple(tuple(a) for a in en))


STYLE = ("Calm flat vector illustration, high contrast, clear bold shapes, limited warm palette, "
         "uncluttered composition, no text, no letters, no numbers, no signs with writing, "
         "no watermark, 1536x1024, landscape. ")

BUS_STOP = Scene(
    id="bus-stop-rain", title_ru="Остановка в дождь", title_en="Bus stop in the rain",
    image_file="bus-stop-rain.png",
    image_prompt=(
        STYLE + "A rainy afternoon at a city bus stop. In the center a woman in a green coat holds a big "
        "red umbrella and a shopping bag. A small bird sits on top of the umbrella. On a bench to the left "
        "an old man in a grey cap reads a newspaper. On the right a young boy in bright yellow rubber boots "
        "jumps into a large puddle, and in the puddle a fish is swimming. A brown dog sits on a leash beside "
        "the bench, looking at the boy. A bus with lit windows is arriving from the far right. A tall pole "
        "with a round blank sign and a round clock stands at the stop. Rain falls in clear diagonal lines."),
    units=(
        _u(1, "person", "женщина", "woman", [["женщин"], ["девушк"], ["дам$"]], [["woman"], ["lady"]]),
        _u(2, "object", "красный зонт", "red umbrella", [["зонт"]], [["umbrella"]]),
        _u(3, "setting", "идёт дождь", "it is raining", [["дожд"]], [["rain"]]),
        _u(4, "person", "старик на скамейке", "old man on a bench", [["скамей"], ["лавк"]], [["bench"]]),
        _u(5, "object", "газета", "newspaper", [["газет"]], [["newspaper"], ["paper$"]]),
        _u(6, "person", "мальчик", "boy", [["мальчик"], ["ребен"], ["малыш"]], [["boy"], ["child"], ["kid$"]]),
        _u(7, "object", "жёлтые сапоги", "yellow boots", [["сапог"], ["сапож"], ["ботинк"]], [["boot"]]),
        _u(8, "action", "прыгает в лужу", "jumps in a puddle", [["луж"]], [["puddle"]]),
        _u(9, "object", "собака на поводке", "dog on a leash", [["собак"], ["пес$"], ["пса$"], ["щен"]], [["dog"], ["puppy"]]),
        _u(10, "object", "автобус", "bus", [["автобус"]], [["bus$"], ["buses"]]),
        _u(11, "object", "столб с часами", "pole with a clock", [["часы$"], ["часов"], ["часами"], ["столб"]], [["clock"], ["pole$"]]),
        _u(12, "object", "сумка с покупками", "shopping bag", [["сумк"], ["пакет"], ["покупк"], ["продукт"]],
           [["bag$"], ["groceries"], ["shopping"]]),
        _u(13, "oddity", "рыба в луже", "fish in the puddle", [["рыб"]], [["fish"]]),
        _u(14, "oddity", "птица на зонте", "bird on the umbrella", [["птиц"], ["воробь"], ["голуб"]],
           [["bird"], ["pigeon"], ["sparrow"]]),
    ),
)

BACKYARD = Scene(
    id="backyard-wind", title_ru="Двор в ветреный день", title_en="Backyard on a windy day",
    image_file="backyard-wind.png",
    image_prompt=(
        STYLE + "A sunny but windy backyard of a village house. On the left a woman in a blue dress hangs white "
        "sheets on a clothesline, the sheets blowing strongly in the wind. A black cat sits on the clothesline "
        "between the sheets. In the middle a boy runs holding a kite string, and the red kite is caught in the "
        "branches of an apple tree. A tall wooden ladder stands alone in the middle of the lawn, leaning on "
        "nothing. On the right a grandfather in a straw hat waters colorful flowers with a green garden hose. "
        "A girl sits on the grass reading a book. In the foreground a small table with a teapot and two cups, "
        "and a basket of red apples. A pair of old shoes hangs from a branch of the tree. Clear blue sky, "
        "one small bird on the roof."),
    units=(
        _u(1, "person", "женщина", "woman", [["женщин"], ["мам$"], ["мама"]], [["woman"], ["mother"], ["mom$"], ["lady"]]),
        _u(2, "action", "вешает бельё", "hangs laundry", [["бель"], ["простын"], ["веревк"], ["вешает"], ["развеш"]],
           [["laundry"], ["sheet"], ["washing"], ["clothesline"], ["clothes"]]),
        _u(3, "setting", "сильный ветер", "strong wind", [["ветер"], ["ветр"], ["ветрен"]], [["wind"]]),
        _u(4, "person", "мальчик", "boy", [["мальчик"], ["ребен"]], [["boy"], ["child"]]),
        _u(5, "object", "воздушный змей", "kite", [["змей"]], [["kite"]]),
        _u(6, "action", "змей застрял на дереве", "kite is caught in the tree",
           [["дерев"], ["ветк"], ["застр"], ["запута"], ["яблон"]], [["tree"], ["stuck"], ["caught"], ["tangled"]]),
        _u(7, "person", "дедушка", "grandfather", [["дед"], ["старик"], ["пожил"]],
           [["grandfather"], ["grandpa"], ["elderly"], ["old", "man"]]),
        _u(8, "action", "поливает из шланга", "waters with a hose", [["шланг"], ["полив"], ["поли"]], [["hose"], ["water"]]),
        _u(9, "object", "цветы", "flowers", [["цвет"], ["клумб"]], [["flower"]]),
        _u(10, "oddity", "кот на верёвке", "cat on the clothesline", [["кот$"], ["кошк"], ["кота$"], ["коте$"]], [["cat$"], ["kitten"]]),
        _u(11, "person", "девочка с книгой", "girl with a book", [["девочк"], ["книг"], ["чита"]],
           [["girl"], ["book"], ["reading"], ["reads"]]),
        _u(12, "object", "стол с чайником", "table with a teapot", [["чайник"], ["стол"], ["чашк"], ["чай$"]],
           [["teapot"], ["table"], ["cups"], ["tea$"]]),
        _u(13, "object", "корзина яблок", "basket of apples", [["яблок"], ["корзин"]], [["apple"], ["basket"]]),
        _u(14, "oddity", "лестница посреди двора", "ladder in the middle of the lawn",
           [["лестниц"]], [["ladder"]]),
        _u(15, "oddity", "ботинки на ветке", "shoes hanging on a branch", [["ботин"], ["башмак"], ["туфл"], ["обув"]],
           [["shoe"], ["boots"]]),
    ),
)

SCENES = {s.id: s for s in (BUS_STOP, BACKYARD)}


def get_scene(scene_id: str) -> Scene:
    try:
        return SCENES[scene_id]
    except KeyError:
        raise KeyError(f"unknown picture: {scene_id!r}")


def score_picture(tr: Transcript, scene: Scene, language: str | None = None) -> dict:
    lang = language or tr.language
    tokens = [t for t in (norm_token(w.text) for w in tr.words) if t]
    found = []
    for u in scene.units:
        alts = u.ru if lang == "ru" else u.en
        if any(_alt_matches(tokens, a) for a in alts):
            found.append(u.id)
    total = len(scene.units)
    return {"picture_id": scene.id, "picture_units_found": found, "picture_units_total": total,
            "picture_units_count": len(found), "picture_units_frac": len(found) / total}
