"""Category fluency ("name animals in 60 seconds"): count, 15 s dynamics, repeats, clusters, switches."""
from __future__ import annotations

from .lang import check_language, is_function_word, norm_stem, norm_token
from .types import Transcript

SEGMENT_S = 15.0
TASK_S = 60.0

# animal -> subcategories (an animal may belong to several). Small on purpose.
_RAW = {
    "en": {
        "pets": "dog cat hamster rabbit parrot goldfish guinea-pig kitten puppy",
        "farm": "cow horse pig sheep goat chicken hen rooster duck goose donkey turkey lamb",
        "african": "lion tiger elephant giraffe zebra hippo rhino leopard cheetah monkey gorilla camel",
        "forest": "bear wolf fox deer moose squirrel hedgehog boar owl lynx badger raccoon",
        "birds": "bird eagle owl parrot sparrow crow duck goose chicken hen rooster turkey pigeon swan penguin",
        "water": "fish shark whale dolphin seal octopus crab turtle frog goldfish duck swan penguin",
        "insects": "bee ant fly butterfly spider beetle mosquito ladybug wasp",
        "rodents": "mouse rat hamster squirrel guinea-pig beaver",
    },
    "ru": {
        "pets": "собака кошка кот хомяк кролик попугай рыбка щенок котенок морская-свинка",
        "farm": "корова лошадь свинья овца коза курица петух утка гусь осел индюк баран бык",
        "african": "лев тигр слон жираф зебра бегемот носорог леопард гепард обезьяна горилла верблюд",
        "forest": "медведь волк лиса олень лось белка еж кабан сова рысь барсук заяц",
        "birds": "птица орел воробей ворона утка гусь курица петух голубь лебедь пингвин сова попугай индюк",
        "water": "рыба акула кит дельфин тюлень осьминог краб черепаха лягушка утка лебедь пингвин",
        "insects": "пчела муравей муха бабочка паук жук комар оса",
        "rodents": "мышь крыса хомяк белка бобр",
    },
}
_RAW["en"]["pets"] = _RAW["en"]["pets"].replace("guinea-pig", "guineapig")
_RAW["en"]["rodents"] = _RAW["en"]["rodents"].replace("guinea-pig", "guineapig")


def _build(lang: str) -> dict[str, set[str]]:
    animal_cats: dict[str, set[str]] = {}
    for cat, names in _RAW[lang].items():
        for name in names.split():
            animal_cats.setdefault(norm_stem(name.replace("-", " ")), set()).add(cat)
    return animal_cats


ANIMALS = {lang: _build(lang) for lang in ("en", "ru")}


def _match(tok: str, lang: str) -> str | None:
    """Return the canonical animal name for a token (plural / case endings tolerated)."""
    table = ANIMALS[lang]
    if tok in table:
        return tok
    if lang == "en":
        for suf in ("s", "es"):
            if tok.endswith(suf) and tok[: -len(suf)] in table:
                return tok[: -len(suf)]
        if tok == "mice":
            return "mouse"
        if tok == "geese":
            return "goose"
        return None
    for name in table:
        stem = name[:-1] if name[-1] in "аяоеыиьй" else name
        if tok.startswith(stem) and tok[len(stem):] in _RU_ENDINGS:
            return name
    return None


_RU_ENDINGS = {"", "а", "я", "у", "ю", "е", "ы", "и", "ь", "й", "ой", "ей", "ом", "ем", "ов", "ев",
               "ами", "ях", "ах", "ям", "ам", "ою", "ею", "ят", "ата", "ята", "ка", "ки"}


def analyze_fluency(tr: Transcript, language: str | None = None) -> dict:
    lang = check_language(language or tr.language)
    seen: dict[str, float] = {}
    valid_seq: list[tuple[str, float]] = []  # unique valid animals in order of first use
    repeats = 0
    off_category = 0
    for w in tr.words:
        tok = norm_token(w.text)
        if not tok:
            continue
        name = _match(tok, lang)
        if name is None:
            if not is_function_word(tok, lang):
                off_category += 1
            continue
        if name in seen:
            repeats += 1
            continue
        seen[name] = w.start
        valid_seq.append((name, w.start))

    n_seg = int(TASK_S // SEGMENT_S)
    segments = [0] * n_seg
    for _, t in valid_seq:
        idx = min(int(max(t, 0.0) // SEGMENT_S), n_seg - 1)
        segments[idx] += 1

    # Clusters and switches: consecutive animals that share at least one subcategory are one cluster.
    table = ANIMALS[lang]
    clusters: list[list[str]] = []
    switches = 0
    for name, _ in valid_seq:
        if clusters and (table[name] & table[clusters[-1][-1]]):
            clusters[-1].append(name)
        else:
            if clusters:
                switches += 1
            clusters.append([name])
    count = len(valid_seq)
    first = valid_seq[0][1] if valid_seq else None
    early, late = segments[0], segments[-1]
    return {
        "fluency_count": count,
        "fluency_segments": segments,
        "fluency_late_early_ratio": (late / early) if early else None,
        "fluency_repeats": repeats,
        "fluency_off_category": off_category,
        "fluency_switches": switches,
        "fluency_mean_cluster_size": (count / len(clusters)) if clusters else None,
        "fluency_first_item_latency": first,
        "fluency_items": [n for n, _ in valid_seq],
    }
