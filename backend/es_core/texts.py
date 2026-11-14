"""Russian text helpers: decimal comma, plural of "неделя". Texts always come with codes and numbers."""


def num_ru(x: float, digits: int = 2) -> str:
    return f"{x:.{digits}f}".replace(".", ",")


def weeks_ru(n: int) -> str:
    n = abs(int(n))
    if 11 <= n % 100 <= 14:
        word = "недель"
    elif n % 10 == 1:
        word = "неделя"
    elif 2 <= n % 10 <= 4:
        word = "недели"
    else:
        word = "недель"
    return f"{n} {word}"


def guillemets(s: str) -> str:
    return f"«{s}»"
