"""Small per-language dictionaries. Temporal features do not use them.

These are deliberately tiny, readable lists, not a morphological analyser.
TODO: replace the noun proxy with a real POS tagger (spaCy / pymorphy) after the MVP.
"""
from __future__ import annotations

import re

_PUNCT = re.compile(r"^[^\w]+|[^\w]+$", re.UNICODE)


def norm_token(text: str) -> str:
    t = _PUNCT.sub("", text.strip().lower())
    return t.replace("ё", "е")


def norm_stem(s: str) -> str:
    return s.lower().replace("ё", "е")


PRONOUNS = {
    "en": {
        "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
        "this", "that", "these", "those", "something", "someone", "anything", "everything",
        "thing", "stuff", "one", "his", "hers", "its", "their", "theirs", "my", "your",
    },
    "ru": {
        "я", "ты", "он", "она", "оно", "мы", "вы", "они", "меня", "тебя", "его", "ее", "нас",
        "вас", "их", "ему", "ей", "им", "нам", "вам", "мне", "тебе", "это", "эта", "этот",
        "эти", "то", "тот", "та", "те", "что-то", "кто-то", "нечто", "вещь", "штука", "там",
    },
}
# "thing/stuff/вещь/штука/там" act as vague nouns: they count as pronoun-like (empty words).

FUNCTION_WORDS = {
    "en": {
        "a", "an", "the", "and", "or", "but", "so", "if", "of", "to", "in", "on", "at", "by",
        "for", "with", "from", "up", "down", "out", "is", "are", "was", "were", "be", "been",
        "am", "do", "does", "did", "have", "has", "had", "not", "no", "as", "than", "then",
        "there", "here", "when", "while", "because", "which", "who", "what", "where", "how",
        "can", "could", "will", "would", "just", "very", "also", "into", "about", "over",
    },
    "ru": {
        "и", "а", "но", "или", "если", "что", "чтобы", "как", "когда", "пока", "потому", "в",
        "на", "с", "со", "к", "по", "из", "у", "о", "об", "от", "за", "для", "до", "не", "ни",
        "же", "ли", "бы", "вот", "тут", "здесь", "есть", "был", "была", "было", "были", "быть",
        "очень", "уже", "еще", "так", "там", "где", "который", "которая", "которые", "или",
    },
}

SUBORDINATORS = {
    "en": {"because", "which", "who", "whom", "whose", "that", "when", "while", "although",
           "though", "if", "unless", "since", "after", "before", "until", "where", "whereas"},
    "ru": {"потому", "который", "которая", "которое", "которые", "которого", "когда", "пока",
           "если", "хотя", "чтобы", "поскольку", "после", "прежде", "где", "как"},
}

FILLERS = {
    "en": {"um", "uh", "er", "erm", "hmm", "mm", "uhm", "ah", "eh", "umm", "uhh"},
    "ru": {"э", "ээ", "эээ", "эм", "м", "мм", "ммм", "хм", "ну", "аа", "ааа", "ыы"},
}
FILLER_PHRASES = {
    "en": [("you", "know"), ("i", "mean"), ("kind", "of"), ("sort", "of")],
    "ru": [("как", "бы"), ("это", "самое"), ("в", "общем"), ("так", "сказать")],
}
CORRECTION_PHRASES = {
    "en": [("no", "wait"), ("i", "mean"), ("sorry",), ("rather",), ("or", "rather"), ("actually",)],
    "ru": [("то", "есть"), ("точнее",), ("нет", "подожди"), ("вернее",), ("извини",), ("нет", "нет")],
}

# Noun proxy. A content word is counted as a noun unless it looks like a verb,
# adjective, adverb. Crude on purpose: it is used only as the denominator of
# pronoun_share, and the same rule applies to every patient.
_NON_NOUN_EN_SUFFIX = ("ing", "ed", "ly", "ous", "ful", "ive", "able", "ible", "ish")
_NON_NOUN_EN_WORDS = {"go", "went", "see", "saw", "get", "got", "make", "made", "say", "said",
                      "take", "took", "come", "came", "put", "give", "gave", "look", "like",
                      "big", "small", "little", "good", "bad", "old", "new", "red", "blue",
                      "green", "happy", "sad", "now", "again", "well", "too", "more", "most"}
_NON_NOUN_RU_SUFFIX = ("ть", "ться", "ет", "ут", "ют", "ит", "ят", "ешь", "ишь", "ем", "им",
                       "ла", "ли", "ло", "ый", "ий", "ой", "ая", "яя", "ое", "ее", "ые", "ие",
                       "ого", "его", "ому", "ую", "юю", "ым", "ом", "но", "но")
_NON_NOUN_RU_WORDS = {"очень", "много", "мало", "сейчас", "потом", "тоже", "опять", "тогда",
                      "можно", "нужно", "надо", "хорошо", "плохо"}


def is_function_word(tok: str, lang: str) -> bool:
    return tok in FUNCTION_WORDS[lang] or tok in PRONOUNS[lang] or tok in FILLERS[lang]


def is_pronoun(tok: str, lang: str) -> bool:
    return tok in PRONOUNS[lang]


def is_noun_proxy(tok: str, lang: str) -> bool:
    if is_function_word(tok, lang) or len(tok) < 3 or tok.isdigit():
        return False
    if lang == "en":
        if tok in _NON_NOUN_EN_WORDS:
            return False
        return not tok.endswith(_NON_NOUN_EN_SUFFIX)
    if tok in _NON_NOUN_RU_WORDS:
        return False
    return not tok.endswith(_NON_NOUN_RU_SUFFIX)


def check_language(lang: str) -> str:
    if lang not in ("en", "ru"):
        raise ValueError(f"unsupported language: {lang!r} (supported: en, ru)")
    return lang
