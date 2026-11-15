# Siriva pitch (working name Es): one layout -> HTML (PDF via tools/pdf.mjs) and editable PPTX (python-pptx).
# Style: formal medical talk + trends from the user (bento cards, giant type, glass plates, soft 3D objects).
# White background, navy + teal, sans only, strict 12-col grid, sources as footnotes.
# Run: python3 es/pitch/src/build.py   (then src/shots.sh and tools/pdf.mjs, see README)
# Speaker notes come from ../SPEECH.md (sections "## 01 ...").
import html, os, re
from PIL import ImageFont, Image
from lxml import etree
from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.dml import MSO_LINE_DASH_STYLE

HERE = os.path.dirname(os.path.abspath(__file__))
PITCH = os.path.dirname(HERE)
ES = os.path.dirname(PITCH)
SCREENS_DIR = os.path.join(PITCH, "assets", "screens-src")  # shot by src/snap.mjs from the local demo
OBJ_DIR = os.path.join(ES, "design", "assets")  # soft 3D objects (generated with tools/codex-image.sh)

# ---------------------------------------------------------------- data that may change
ADRESS_OURS = None   # our ADReSS accuracy, e.g. "83,3 %"; None = "в работе"
AGREEMENT = "0,53"   # mean agreement of predicted load with expert labels over three functions; None = "в работе"
AGREEMENT_DETAIL = "Подбор слов 0,88, фразы 0,68, внимание 0,03. Речевые и зрительные задания разделяются (rbc +1,0). Разметки специалистов пока нет."
TRIBE_DONE = True    # hybrid: speech and attention load from TRIBE v2, memory and speed from task-type estimate
BRAND = "Siriva"
TEAM = []  # names removed from the slides at the user's request
EVENT = ""

# Screens are 1280x800 viewport shots (re-shot by frontend at 19:35): use them whole.
SCREEN_CROP = {"d2": ("d2-live.png", 0), "d3": ("d3-profile.png", 0),
               "d4": ("d4-bypass.png", 0), "d5": ("d5-family.png", 0)}
SLOT_W, SLOT_H = 884, 552
SCREEN_LABEL = {k: f"Скриншот: /demo, {k}" for k in SCREEN_CROP}
OBJECTS = {"memory": "es-3d-memory.png", "links": "es-3d-links.png", "trajectory": "es-3d-trajectory.png"}

# ---------------------------------------------------------------- clinical palette
# DESIGN-MEDTECH.md section 12 (cold clinical variant for slides and jury screens); "navy" = blue, "teal" = accent.
C = dict(bg="FFFFFF", card="F3F6F8", card2="E3E9ED", line="DCE3E8", line_strong="857D6E",
         ink="1E2320", ink2="454C47", ink3="5E655F", navy="2F5D7C", teal="1C5A51", teal_soft="DCEAE5",
         deep="12332E", on_deep="E3EFEA", on_deep2="A9D3C6",
         shadow="E6EBEF", brainbg="F0F4F5", white="FFFFFF", syn="45376A", syn_soft="ECE6F4")
MIN_PX = 23  # 14 pt on a 13.333 in slide (DESIGN-MEDTECH section 10: nothing smaller than 14 pt)
W, H = 1600, 900
MX = 96
RAD = 16
FONT_HTML = "'Golos Text', 'IBM Plex Sans', 'PT Sans', Arial, sans-serif"
FONT_PPTX = "Arial"
TTF = {False: "/System/Library/Fonts/Supplemental/Arial.ttf", True: "/System/Library/Fonts/Supplemental/Arial Bold.ttf"}


SITE_DIR = os.path.join(ES, "web", "docs", "site")  # landing screenshots (only read)


def find_screen(key):
    """Cropped copy in es/pitch/assets/screens (sources are only read)."""
    if key == "site":
        import glob as _g
        pinned = os.path.join(SCREENS_DIR, "landing.png")  # first screen of the landing, shot by src/snap.mjs
        files = [pinned] if os.path.exists(pinned) else sorted(_g.glob(os.path.join(SITE_DIR, "landing-*.png")))
        if not files:
            return find_screen("d2")
        src, y0 = files[0], 0
    else:
        src = os.path.join(SCREENS_DIR, SCREEN_CROP[key][0])
    if not os.path.exists(src):
        return None
    out = os.path.join(PITCH, "assets", "screens", key + ".png")
    if not os.path.exists(src):
        return None
    if not os.path.exists(out) or os.path.getmtime(out) < max(os.path.getmtime(src), os.path.getmtime(__file__)):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im = Image.open(src).convert("RGB")
        y0 = 0 if key == "site" else SCREEN_CROP[key][1]
        im.crop((0, y0, im.width, min(im.height, y0 + int(im.width * SLOT_H / SLOT_W)))).save(out)
    return out


def find_object(key):
    """Soft 3D object with the white background made transparent (copy *-transparent.png next to the original)."""
    src = os.path.join(OBJ_DIR, OBJECTS[key])
    if not os.path.exists(src):
        return None
    out = src.replace(".png", "-transparent.png")
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
        im = Image.open(src).convert("RGBA")
        px = im.load()
        W_, H_ = im.size

        def bg_like(xx, yy):
            r, g, b, _ = px[xx, yy]
            return max(r, g, b) - min(r, g, b) <= 4 and min(r, g, b) > 90
        # flood fill from the border: only the white background and the grey contact shadow, not highlights inside the object
        seen = bytearray(W_ * H_)
        stack = [(xx, yy) for xx in range(W_) for yy in (0, H_ - 1)] + [(xx, yy) for yy in range(H_) for xx in (0, W_ - 1)]
        while stack:
            xx, yy = stack.pop()
            i = yy * W_ + xx
            if seen[i] or not bg_like(xx, yy):
                continue
            seen[i] = 1
            m = min(px[xx, yy][:3])
            px[xx, yy] = (0, 0, 0, 0 if m > 246 else int((246 - m) * 0.9))
            if xx > 0: stack.append((xx - 1, yy))
            if xx < W_ - 1: stack.append((xx + 1, yy))
            if yy > 0: stack.append((xx, yy - 1))
            if yy < H_ - 1: stack.append((xx, yy + 1))
        # clean the light fringe: edge pixels next to the cut that are still bright and greyish become shadow too
        for _ in range(3):
            edge = []
            for yy in range(1, H_ - 1):
                row = yy * W_
                for xx in range(1, W_ - 1):
                    i = row + xx
                    if seen[i]:
                        continue
                    if seen[i - 1] or seen[i + 1] or seen[i - W_] or seen[i + W_]:
                        r, g, b, _ = px[xx, yy]
                        if min(r, g, b) > 110 and max(r, g, b) - min(r, g, b) < 60:
                            edge.append((xx, yy, min(r, g, b)))
            for xx, yy, m in edge:
                seen[yy * W_ + xx] = 1
                px[xx, yy] = (0, 0, 0, max(0, int((246 - m) * 0.9)))
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
        # contact shadow zone at the bottom: remaining light greyish pixels become dark shadow (no light rim on dark slides)
        px = im.load()
        for yy in range(int(im.height * 0.85), im.height):
            for xx in range(im.width):
                r, g, b, a = px[xx, yy]
                if a and max(r, g, b) - min(r, g, b) < 22:
                    px[xx, yy] = (0, 0, 0, min(a, max(0, int((246 - min(r, g, b)) * 0.9))))
        im.save(out)
    return out


# ---------------------------------------------------------------- element constructors
def T(x, y, w, h, text, size=24, bold=False, color="ink", align="left", lh=1.35, gap=0.5, anchor="top", hl=None):
    size = max(size, MIN_PX)
    return dict(k="text", x=x, y=y, w=w, h=h, text=text, size=size, bold=bold, color=color,
                align=align, lh=lh, gap=gap, anchor=anchor, hl=hl)


def R(x, y, w, h, fill=None, line=None, lw=1, radius=0, dash=False, glass=False):
    return dict(k="rect", x=x, y=y, w=w, h=h, fill=fill, line=line, lw=lw, radius=radius, dash=dash, glass=glass)


def SHOT(x, y, w, h, key):
    return dict(k="shot", x=x, y=y, w=w, h=h, key=key)


def IMG(x, y, w, h, path):
    return dict(k="img", x=x, y=y, w=w, h=h, path=path)


def OBJ(x, y, w, h, key):
    return dict(k="obj", x=x, y=y, w=w, h=h, key=key)


def card(x, y, w, h, fill="card"):
    return R(x, y, w, h, fill=fill, line="line", radius=RAD)


def glass(x, y, w, h, head, body=None):
    e = [R(x, y, w, h, fill="white", line="line", radius=16, glass=True),
         T(x + 22, y + 14, w - 44, 30, head, size=23, bold=True, color="navy", lh=1.2)]
    if body:
        e.append(T(x + 22, y + 50, w - 44, h - 56, body, size=23, color="ink", lh=1.3))
    return e


def pill(x, y, text, size=23, fg="syn", bg="syn_soft"):
    f = ImageFont.truetype(TTF[True], size)
    tw = int(f.getlength(text) * 1.06) + 40
    return [R(x, y, tw, size + 20, fill=bg, radius=(size + 20) // 2),
            T(x, y + 9, tw, size + 4, text, size=size, bold=True, color=fg, align="center", lh=1.0)]


def circle(x, y, n, d=44, fill="navy"):
    return [R(x, y, d, d, fill=fill, radius=d // 2),
            T(x, y + (d - 26) // 2, d, 28, str(n), size=23, bold=True, color="white", align="center", lh=1.0)]


def banner(y, text, h=90):
    """Dark banner at the bottom of a white slide (JAZ rhythm)."""
    return [R(MX, y, 1408, h, fill="deep", radius=14),
            R(MX + 26, y + (h - 34) // 2, 34, 34, fill="on_deep2", radius=17),
            T(MX + 26, y + (h - 34) // 2 + 4, 34, 28, "!", size=23, bold=True, color="deep", align="center", lh=1.0),
            T(MX + 80, y + 10, 1300, h - 20, text, size=23, bold=True, color="on_deep", lh=1.3, hl="on_deep2", anchor="middle")]


def capsule(x, y, text):
    """Dark caption pill over a screenshot (JAZ «Қалай көрінеді»)."""
    return pill(x, y, text, size=23, fg="on_deep", bg="deep")


def title(text, y=104, size=60, w=1408, h=76, color="ink"):
    return T(MX, y, w, h, text, size=size, bold=True, color=color, lh=1.08, gap=0)


def lead(text, y=184, w=1408, h=80, color="ink", hl="teal", size=34):
    return T(MX, y, w, h, text, size=size, bold=True, color=color, lh=1.2, hl=hl)


SYN = "Синтетический пациент. Данные не реальные"


# ---------------------------------------------------------------- slides (8 slides, composition after the JAZ deck)
def slides():
    S = []
    TR = os.path.join(PITCH, "assets", "tribe")

    # 01 Cover (deep) ---------------------------------------------------
    els = [R(0, 0, W, H, fill="deep"),
           R(1180, -160, 520, 520, fill="teal", radius=260),
           SHOT(860, 170, 820, 512, "site"),
           T(MX, 190, 760, 240, BRAND, size=200, bold=True, color="white", lh=1.0),
           T(MX, 432, 720, 156, "Веб-платформа когнитивной реабилитации: **упражнения, которые измеряют.**",
             size=36, bold=True, color="white", lh=1.22, hl="on_deep2"),
           T(MX, 596, 700, 124, "Короткие ежедневные упражнения по речи; профиль из пяти функций и подбор следующих заданий по предсказанной нагрузке.",
             size=24, color="on_deep2", lh=1.4),
           ]
    S.append(dict(sec=None, dark=True, els=els))

    # 02 Problem and evidence -------------------------------------------
    els = [title("Проблема"),
           lead("Изменения замечают поздно. **А упражнения подбирают на глаз.**", h=50)]
    items = [("Близкие замечают поздно", "часто, когда изменения уже очевидны"),
             ("Разметка на глаз", "«на память», «на внимание» без метода"),
             ("Адаптация по баллу", "у массовых тренажёров «8 из 10» скрывает замедление ответа [3]"),
             ("Трудное снова и снова", "речевые задания при трудностях с речью")]
    y = 262
    for i, (h1, body) in enumerate(items):
        els += [card(MX, y, 640, 120)] + circle(MX + 24, y + 38, i + 1) + [
                T(MX + 88, y + 12, 530, 34, h1, size=27, bold=True, lh=1.15),
                T(MX + 88, y + 50, 530, 66, body, size=23, color="ink2", lh=1.2)]
        y += 128
    stats = [("7,6", "года", "В Framingham по письменному описанию картинки удалось предсказать начало болезни Альцгеймера (AUC 0,74) [1].", "teal_soft", "teal"),
             ("475", "человек", "Реабилитация с личными целями помогает на ранней стадии достигать выбранных целей в быту [2].", "card", "navy")]
    for j, (num, unit, body, fill, col) in enumerate(stats):
        x = MX + 664 + j * 384
        els += [card(x, 262, 360, 504, fill=fill),
                T(x + 28, 284, 304, 140, num, size=120, bold=True, color=col, lh=1.0),
                T(x + 28, 432, 304, 36, unit, size=30, bold=True, lh=1.0),
                T(x + 28, 484, 304, 250, body, size=23, color="ink2", lh=1.4)]
    S.append(dict(sec="Проблема", els=els, foot=[
        "[1] Eyigoz E. et al., EClinicalMedicine 2020; одна когорта, письменный текст, 80 человек в тесте.",
        "[2] Clare L. et al., GREAT, Int J Geriatr Psychiatry 2019; очно, с терапевтом.   [3] Условный пример."]))

    # 03 Solution -------------------------------------------------------
    els = [title("Решение"),
           lead("Каждое упражнение **одновременно измеряет.**", h=50)]
    layers = [("Упражнение как измерение", "картинка, называние, пересказ; паузы и задержки фоном"),
              ("Профиль из пяти функций", "по микрометрикам речи, а не по баллу"),
              ("Подбор по предсказанной нагрузке", "речь и внимание из TRIBE v2, память и скорость по типу задания" if TRIBE_DONE else
               "по предсказанной нагрузке (сейчас предварительной)")]
    y = 262
    for i, (h1, body) in enumerate(layers):
        els += [card(MX, y, 640, 150)] + circle(MX + 24, y + 26, i + 1) + [
                T(MX + 88, y + 22, 530, 34, h1, size=27, bold=True, lh=1.15),
                T(MX + 88, y + 64, 530, 74, body, size=23, color="ink2", lh=1.3)]
        y += 162
    els += [SHOT(MX + 664, 262, 744, 466, "site"),
            *capsule(MX + 688, 664, "Сайт Siriva" if find_screen("site") != find_screen("d2") else "Живая запись в /demo")]
    els += banner(756, "Отличие от тренажёров: разметка по предсказанной нагрузке, адаптация по микрометрикам, **обход трудной функции, без обещаний лечения.**", h=90)
    S.append(dict(sec="Решение", els=els))

    # 04 TRIBE v2: detailed cortex (retell) + speech-minus-visual map + agreement
    els = [title("Как TRIBE v2 видит упражнения"),
           T(MX, 182, 1408, 72, "Предсказание по 20 484 точкам коры. У речевых заданий выше отклик **в височной коре слева, в контуре языковой сети.**",
             size=24, color="ink", lh=1.35, hl="teal"),
           T(MX, 262, 560, 30, "Пересказ истории: предсказанный отклик коры", size=23, bold=True, color="navy", lh=1.1),
           R(MX, 300, 560, 444, fill="brainbg", radius=RAD),
           IMG(MX + 8, 302, 544, 440, os.path.join(TR, "brain-crop.png"))]
    rx, rw = MX + 584, 824
    els += [card(rx, 300, rw, 210, fill="white"),
            T(rx + 24, 318, 360, 110, "Речевые минус зрительные задания (9 против 11)", size=23, bold=True, color="navy", lh=1.25),
            T(rx + 24, 434, 360, 64, "контур: языковая сеть", size=23, color="ink3", lh=1.2),
            IMG(rx + rw - 24 - 386, 310, 386, 190, os.path.join(TR, "diff_lateral.png")),
            card(rx, 534, rw, 210, fill="teal_soft"),
            T(rx + 24, 552, rw - 48, 30, "Совпадение с нашей оценкой (Спирмен, 25 упражнений)", size=23, bold=True, lh=1.2),
            T(rx + 24, 596, 220, 90, "0,88", size=80, bold=True, color="teal", lh=1.0),
            T(rx + 24, 690, 220, 30, "подбор слов", size=23, color="ink2", lh=1.0),
            T(rx + 284, 596, 220, 90, "0,68", size=80, bold=True, color="teal", lh=1.0),
            T(rx + 284, 690, 240, 30, "построение фраз", size=23, color="ink2", lh=1.0),
            T(rx + 556, 604, 244, 110, "Внимание: 0,03, не совпало.", size=23, color="ink", lh=1.35)]
    els += banner(760, "Модель усреднённого мозга по звуку и тексту стимула, **не измерение человека.** TRIBE v2 (Meta).", h=84)
    S.append(dict(sec="Решение", els=els))

    # 05 Live demo + reserve main frame ---------------------------------
    els = [title("Живое демо: /demo, около двух минут")]
    steps = [("d2", "Запись", "паузы и задержки видны сразу"),
             ("d3", "Профиль", "пауза 0,41 → 0,62 с, слов 18 → 13"),
             ("d4", "Обходной путь", "одна цель, разные программы"),
             ("d5", "Близкий", "тренд, а не вывод")]
    y = 196
    for i, (key, h1, body) in enumerate(steps):
        els += [card(MX, y, 600, 126), SHOT(MX + 14, y + 14, 156, 98, key)] + circle(MX + 190, y + 18, i + 1, d=36) + [
                T(MX + 240, y + 20, 340, 34, h1, size=27, bold=True, lh=1.1),
                T(MX + 190, y + 66, 400, 50, body, size=23, color="ink2", lh=1.2)]
        y += 138
    els += [SHOT(MX + 624, 196, 784, 490, "d4"),
            *capsule(MX + 648, 622, "Резерв: главный кадр, обходной путь"),
            T(MX + 624, 704, 784, 70, "У А и Б одинаково снижена память. Б с трудностями речи получает зрительные и пространственные задания.",
              size=23, color="ink", lh=1.35)]
    els += pill(MX, 760, SYN)
    S.append(dict(sec="Демонстрация", els=els))

    # 06 Results and honest boundaries ----------------------------------
    els = [title("Результаты и честные границы"),
           T(MX, 182, 1408, 32, "Рис. Точность на ADReSS 2020: описание картинки, английская речь, тест 48 человек (1 человек = 2,1 п. п.)",
             size=23, color="ink2", lh=1.2)]
    nums = [("75 %", 75.0, "Бейзлайн [1]"), ("85,4 %", 85.4, "Логрегрессия [2]"), ("89,6 %", 89.6, "Лучший результат [3]")]
    cw, g = (1408 - 72) // 4, 24
    for i, (v, pv, lab) in enumerate(nums):
        x = MX + i * (cw + g)
        els += [card(x, 228, cw, 190),
                T(x + 26, 250, cw - 52, 84, v, size=72, bold=True, color="navy", lh=1.0),
                R(x + 26, 344, cw - 52, 8, fill="card2", radius=4),
                R(x + 26, 344, int((cw - 52) * pv / 100), 8, fill="navy", radius=4),
                T(x + 26, 368, cw - 52, 34, lab, size=23, color="ink2", lh=1.2)]
    x = MX + 3 * (cw + g)
    els += [R(x, 228, cw, 190, fill="white", line="line_strong", lw=2, dash=True, radius=RAD),
            T(x + 26, 252, cw - 52, 60, ADRESS_OURS or "ждёт данных", size=72 if ADRESS_OURS else 40, bold=True,
              color="teal" if ADRESS_OURS else "ink2", lh=1.15),
            T(x + 26, 316, cw - 52, 34, BRAND, size=23, bold=True, lh=1.2),
            T(x + 26, 346, cw - 52, 70, "нет доступа к DementiaBank", size=23, color="ink2", lh=1.3)]
    hon = [("Данные", "Пациенты в демо синтетические, проверки на людях не было."),
           ("Классификатор", "Готовая исследовательская модель подключена, точность не подтверждена [4]."),
           ("Модель мозга", "Звук и текст на английском, 25 здоровых взрослых; память и скорость по типу задания."),
           ("Выводы", f"{BRAND} не делает медицинских выводов; сырое аудио удаляется после распознавания.")]
    cw2 = (1408 - 24) // 2
    for i, (h1, body) in enumerate(hon):
        x = MX + (i % 2) * (cw2 + 24)
        y = 442 + (i // 2) * 166
        els += [card(x, y, cw2, 152),
                T(x + 28, y + 20, cw2 - 56, 34, h1, size=27, bold=True, color="navy", lh=1.1),
                T(x + 28, y + 62, cw2 - 56, 80, body, size=23, color="ink2", lh=1.35)]
    S.append(dict(sec="Результаты", els=els, foot=[
        "[1] Luz S. et al., Interspeech 2020.   [2] Front. Comput. Sci. 2021.   [3] Yuan J. et al., Interspeech 2020.",
        "[4] Модель xlm-roberta (vjsyong) на Hugging Face; её точность нами не проверялась."]))

    # Market and business model -----------------------------------------
    els = [title("Рынок и бизнес-модель"),
           # Kazakhstan
           card(MX, 196, 400, 280, fill="teal_soft"),
           T(MX + 26, 214, 348, 30, "Казахстан", size=23, bold=True, color="teal", lh=1.0),
           T(MX + 26, 252, 348, 90, "2,8 млн", size=80, bold=True, color="teal", lh=1.0),
           T(MX + 26, 350, 348, 34, "людей 60+, это 13,9% [1]", size=24, bold=True, lh=1.2),
           T(MX + 26, 394, 348, 70, "к 2050 каждый пятый-шестой", size=23, color="ink2", lh=1.3),
           # TAM / SAM / SOM
           card(MX + 424, 196, 584, 280, fill="white"),
           T(MX + 448, 214, 536, 30, "Рынок Казахстана в год, оценка [2]", size=23, bold=True, color="navy", lh=1.0)]
    fun = [("TAM", 1.00, "330-470 тыс. человек", "19,8-28,1 млрд тг"),
           ("SAM", 0.62, "165-235 тыс. человек", "9,9-14,1 млрд тг"),
           ("SOM", 0.32, "1 650-4 700 семей", "99-281 млн тг")]
    fx, bmaxw = MX + 448, 210
    for j, (lab, k, ppl, money) in enumerate(fun):
        yy = 254 + j * 72
        bw = int(bmaxw * k)
        els += [R(fx, yy, bw, 60, fill=["navy", "teal", "teal_soft"][j], radius=10),
                T(fx, yy + 16, bw, 30, lab, size=24, bold=True, color="white" if j < 2 else "teal", align="center", lh=1.0),
                T(fx + bmaxw + 18, yy - 2, 536 - bmaxw - 18, 66, f"{ppl}\n{money}", size=23, bold=True, color="ink", lh=1.2, gap=0)]
    els += [card(MX + 1032, 196, 376, 280),
            T(MX + 1056, 214, 328, 30, "Мир", size=23, bold=True, color="navy", lh=1.0),
            T(MX + 1056, 252, 328, 90, "57 млн", size=80, bold=True, color="navy", lh=1.0),
            T(MX + 1056, 350, 328, 34, "людей с деменцией [3]", size=24, bold=True, lh=1.2),
            T(MX + 1056, 394, 328, 70, "$6 млрд к 2034: цифровая реабилитация, оценка [4]", size=23, color="ink2", lh=1.3)]
    # who pays
    els += [card(MX, 500, 680, 266),
            T(MX + 26, 516, 628, 30, "Кто платит (цены: гипотеза)", size=23, bold=True, color="navy", lh=1.0)]
    pays = [("Семья", "2 990 тг/мес, с экраном близкого 4 990"),
            ("Клиника", "15 000 тг за курс 12 недель или 9 900 тг/мес"),
            ("Далее", "через клинику-партнёра по ОСМС, без гарантий [5]")]
    for j, (h1, body) in enumerate(pays):
        yy = 560 + j * 66
        els += circle(MX + 26, yy, j + 1, d=40, fill="teal" if j < 2 else "line_strong") + [
                T(MX + 82, yy + 6, 130, 30, h1, size=24, bold=True, lh=1.0),
                T(MX + 212, yy + 2, 450, 64, body, size=23, color="ink", lh=1.2)]
    # price comparison
    cx, cw = MX + 704, 704
    els += [card(cx, 500, cw, 266),
            T(cx + 26, 516, cw - 52, 30, "Цена в месяц, тг [6]", size=23, bold=True, color="navy", lh=1.0)]
    prices = [("Siriva, семья", 4990, "4 990", "teal"), ("Викиум", 4815, "~4 815", "line_strong"),
              ("Constant Therapy", 13420, "~13 420", "line_strong"), ("NeuroNation MED", 80300, "~80 300", "line_strong")]
    bx0, bmax = cx + 250, 300
    for j, (lab, v, txt, col) in enumerate(prices):
        yy = 558 + j * 40
        els += [T(cx + 26, yy + 2, 220, 30, lab, size=23, bold=(j == 0), color="ink", lh=1.0),
                R(bx0, yy + 6, max(8, int(bmax * v / 80300)), 22, fill=col, radius=6),
                T(bx0 + max(8, int(bmax * v / 80300)) + 12, yy + 2, 140, 30, txt, size=23, bold=(j == 0), color="teal" if j == 0 else "ink2", lh=1.0)]
    els += [T(cx + 26, 722, cw - 52, 34, "Рост: пилот с клиникой → клиники Казахстана → СНГ", size=23, bold=True, color="teal", lh=1.0)]
    S.append(dict(sec="Рынок", els=els, foot=[
        "[1] ЕНПФ, 2025.  [2] Гипотеза: 60+ × 10-15% MCI + лёгкая деменция; 59 880 тг/год; SAM 50%, SOM 1-2%.",
        "[3] ВОЗ.  [4] Stratistics MRC, оценка.  [5] Приказ ҚР ДСМ-12; оплату приложения по ОСМС не нашли.",
        "[6] Курс НБРК 11.11.2026; NeuroNation MED по возмещению в Германии. Речь: русский, казахский далее."]))

    # 07 Doctor review + next steps --------------------------------------
    els = [title("Отзыв врача и дальнейшие шаги"),
           card(MX, 192, 1100, 300, fill="teal_soft"),
           T(MX + 32, 214, 1036, 170,
             "«Подтверждаю работоспособность представленной версии платформы… рекомендую его поддержку на конкурсном этапе **с последующей пилотной апробацией при участии медицинских специалистов.**»",
             size=27, color="ink", lh=1.38, hl="teal"),
           T(MX + 32, 410, 1036, 72, "Шәділ Мөлдір, врач городской поликлиники № 2 г. Тараз, 14.11.2026. Клиническая эффективность подлежит отдельной оценке.",
             size=23, bold=True, color="ink", lh=1.3),
           card(MX + 1124, 192, 284, 300, fill="white"),
           IMG(MX + 1140, 204, 252, 276, os.path.join(PITCH, "assets", "validation", "doctor-review-thumb.jpg"))]
    road = [("Пилот с врачами", "первый отзыв врача получен"),
            ("Проверка", "сравнение с нейропсихологическим обследованием"),
            ("Казахский и русский", "открытых наборов речи мы не нашли [1]"),
            ("Стимулы", "генерация упражнений под профиль нагрузки")]
    cw, g = (1408 - 72) // 4, 24
    for i, (h1, body) in enumerate(road):
        x = MX + i * (cw + g)
        els += [card(x, 516, cw, 254, fill="teal_soft" if i == 2 else "card")] + circle(x + 24, 540, i + 1, fill="teal" if i == 2 else "navy") + [
                T(x + 24, 596, cw - 48, 40, h1, size=27, bold=True, lh=1.15),
                T(x + 24, 642, cw - 48, 110, body, size=23, color="ink2", lh=1.3)]
    S.append(dict(sec="Дальнейшие шаги", els=els, foot=[
        "Один отзыв врача, не клиническое исследование.   [1] Поиск 14.11.2026; «не нашли» не означает, что их нет."]))

    # 08 Final: thesis, ask, repository QR (deep) ------------------------
    REPO = "github.com/shadix23/siriva"
    els = [R(0, 0, W, H, fill="deep"),
           R(-220, 620, 560, 560, fill="teal", radius=280),
           T(MX, 120, 1408, 170, "Упражнения, которые измеряют, и подбор, который **обходит слабое место.**",
             size=60, bold=True, color="white", lh=1.12, hl="on_deep2"),
           T(MX, 340, 860, 30, "Что нам нужно", size=23, bold=True, color="on_deep2", lh=1.0)]
    asks = ["Научный руководитель для доступа к DementiaBank",
            "Клиника для пилота на 20-30 человек",
            "Обратная связь специалистов по реабилитации"]
    y = 392
    for i, t in enumerate(asks):
        els += circle(MX, y, i + 1, fill="teal") + [T(MX + 66, y + 6, 800, 40, t, size=30, bold=True, color="white", lh=1.1)]
        y += 84
    els += [R(1064, 330, 440, 470, fill="white", radius=RAD),
            T(1088, 350, 392, 80, "Спасибо.\nПосмотрите код и демо", size=28, bold=True, color="deep", align="center", lh=1.2, gap=0),
            IMG(1144, 434, 280, 280, os.path.join(PITCH, "assets", "qr-github.png")),
            T(1088, 734, 392, 34, REPO, size=23, bold=True, color="teal", align="center", lh=1.1)]
    S.append(dict(sec="Итог", dark=True, els=els))
    for i, sl in enumerate(S):
        sl["id"] = f"{i + 1:02d}"
    return S



# ---------------------------------------------------------------- chrome: service bar and footnotes
def chrome(s, total):
    dark = s.get("dark")
    c1, c2, cl = ("white", "on_deep2", "on_deep2") if dark else ("navy", "ink3", "line")
    num = T(W - MX - 300, 42, 300, 26, f"{s['id']} / {total:02d}", size=23, color=c2, align="right", lh=1.0)
    if s.get("sec") is None:
        return [num]
    els = [T(MX, 38, 120, 30, BRAND, size=26, bold=True, color=c1, lh=1.0),
           R(MX + 90, 40, 1, 26, fill=c2),
           T(MX + 108, 42, 900, 26, s["sec"], size=23, color=c2, lh=1.0),
           num, R(MX, 84, W - 2 * MX, 1, fill=cl)]
    foot = s.get("foot")
    if foot:
        fy = H - 24 - 32 * len(foot)
        for j, t in enumerate(foot):
            els.append(T(MX, fy + j * 32, W - 2 * MX, 32, t, size=23, color="ink3", lh=1.2))
    return els



# ---------------------------------------------------------------- inline bold: **text**
def runs(par):
    out, bold = [], False
    for chunk in par.split("**"):
        if chunk:
            out.append((chunk, bold))
        bold = not bold
    return out


# ---------------------------------------------------------------- HTML renderer
def html_el(e):
    st = f"left:{e['x']}px;top:{e['y']}px;width:{e['w']}px;height:{e['h']}px;"
    if e["k"] == "rect":
        st += f"border-radius:{e['radius']}px;"
        if e["glass"]:
            return f'<div class="el glass" style="{st}"></div>'
        if e["fill"]:
            st += f"background:#{C[e['fill']]};"
        if e["line"]:
            st += f"border:{e['lw']}px {'dashed' if e['dash'] else 'solid'} #{C[e['line']]};"
        return f'<div class="el" style="{st}"></div>'
    if e["k"] == "shot":
        p = find_screen(e["key"])
        if p:
            return f'<div class="el shot" style="{st}"><img src="{html.escape(os.path.relpath(p, PITCH))}"></div>'
        return f'<div class="el ph" style="{st}">{html.escape(SCREEN_LABEL[e["key"]])}</div>'
    if e["k"] == "img":
        return f'<div class="el obj" style="{st}"><img src="{html.escape(os.path.relpath(e["path"], PITCH))}"></div>'
    if e["k"] == "obj":
        p = find_object(e["key"])
        if not p:
            return ""
        return f'<div class="el obj" style="{st}"><img src="{html.escape(os.path.relpath(p, PITCH))}"></div>'
    pars = e["text"].split("\n")
    inner = "".join(
        f'<p style="margin:0 0 {e["gap"] if j < len(pars) - 1 else 0}em">' +
        "".join((f'<b style="color:#{C[e["hl"]]}">{html.escape(t)}</b>' if e.get("hl") else f'<b>{html.escape(t)}</b>') if b else html.escape(t) for t, b in runs(p)) + "</p>"
        for j, p in enumerate(pars))
    st += (f"font-size:{e['size']}px;line-height:{e['lh']};color:#{C[e['color']]};"
           f"font-weight:{600 if e['bold'] else 400};text-align:{e['align']};")
    if e["anchor"] == "middle":
        st += "display:flex;flex-direction:column;justify-content:center;"
    if e["size"] >= 60:
        st += "letter-spacing:-0.03em;"
    elif e["size"] >= 40:
        st += "letter-spacing:-0.015em;"
    return f'<div class="el txt" style="{st}">{inner}</div>'


def build_html(S):
    total = len(S)
    secs = [f'<section class="slide" id="s{s["id"]}">' + "".join(html_el(e) for e in s["els"] + chrome(s, total)) + "</section>"
            for s in S]
    css = f"""
@font-face{{font-family:'Golos Text';src:url(assets/fonts/golos-text-cyrillic-wght-normal.woff2) format('woff2');font-weight:400 900;unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;}}
@font-face{{font-family:'Golos Text';src:url(assets/fonts/golos-text-latin-wght-normal.woff2) format('woff2');font-weight:400 900;}}
@page{{size:1600px 900px;margin:0}}
*{{box-sizing:border-box}}
html,body{{margin:0;background:#{C['bg']};font-family:{FONT_HTML};font-variant-numeric:tabular-nums}}
.slide{{position:relative;width:1600px;height:900px;overflow:hidden;background:#{C['bg']};break-after:page;margin:0 auto 24px;}}
.el{{position:absolute}}
.txt b{{font-weight:600;color:#{C['ink']}}}
.ph{{border:1px dashed #{C['line_strong']};border-radius:{RAD}px;background:#{C['card']};display:flex;align-items:center;justify-content:center;font-size:18px;color:#{C['ink3']}}}
.shot{{border:1px solid #DCE3E8;border-radius:8px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(30,35,32,.06)}}
.shot img{{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}}
.obj img{{width:100%;height:100%;object-fit:contain;display:block}}
.glass{{background:rgba(255,255,255,.9);border:1px solid rgba(30,35,32,.14);backdrop-filter:blur(12px) saturate(1.1);-webkit-backdrop-filter:blur(12px) saturate(1.1);box-shadow:0 1px 2px rgba(30,35,32,.06),0 8px 24px rgba(30,35,32,.12)}}
@media print{{.slide{{margin:0}}}}
body.one .slide{{display:none;margin:0}} body.one .slide.on{{display:block}}
"""
    js = "<script>const q=new URLSearchParams(location.search).get('s');if(q){document.body.classList.add('one');const el=document.getElementById('s'+q);if(el)el.classList.add('on');}</script>"
    return f'<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Siriva pitch</title><style>{css}</style></head><body>{"".join(secs)}{js}</body></html>'


# ---------------------------------------------------------------- PPTX renderer
PX = 12192000 // W  # EMU per px


def E(v):
    return Emu(int(round(v * PX)))


def rgb(name):
    return RGBColor.from_string(C[name])


def set_alpha(shape, alpha):
    clr = shape.fill._xPr.find(".//{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr")
    if clr is not None:
        a = etree.SubElement(clr, "{http://schemas.openxmlformats.org/drawingml/2006/main}alpha")
        a.set("val", str(int(alpha * 100000)))


def pptx_el(slide, e):
    if e["k"] == "rect":
        shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if e["radius"] else MSO_SHAPE.RECTANGLE,
                                     E(e["x"]), E(e["y"]), E(max(e["w"], 1)), E(max(e["h"], 1)))
        if e["radius"]:
            shp.adjustments[0] = min(0.5, e["radius"] / max(1, min(e["w"], e["h"])))
        if e["fill"]:
            shp.fill.solid(); shp.fill.fore_color.rgb = rgb(e["fill"])
            if e["glass"]:
                set_alpha(shp, 0.9)
        else:
            shp.fill.background()
        if e["line"]:
            shp.line.color.rgb = rgb(e["line"]); shp.line.width = E(e["lw"])
            if e["dash"]:
                shp.line.dash_style = MSO_LINE_DASH_STYLE.DASH
        else:
            shp.line.fill.background()
        shp.shadow.inherit = False
        return
    if e["k"] == "shot":
        p = find_screen(e["key"])
        if p:
            iw, ih = Image.open(p).size
            box_r, img_r = e["w"] / e["h"], iw / ih
            pic = slide.shapes.add_picture(p, E(e["x"]), E(e["y"]), E(e["w"]), E(e["h"]))
            if img_r > box_r:
                pic.crop_right = 1 - box_r / img_r
            else:
                pic.crop_bottom = 1 - img_r / box_r
            pic.line.color.rgb = rgb("line"); pic.line.width = E(1)
        else:
            pptx_el(slide, R(e["x"], e["y"], e["w"], e["h"], fill="card", line="line_strong", dash=True, radius=RAD))
        return
    if e["k"] in ("obj", "img"):
        p = e["path"] if e["k"] == "img" else find_object(e["key"])
        if p:
            iw, ih = Image.open(p).size
            s = min(e["w"] / iw, e["h"] / ih)
            w, h = iw * s, ih * s
            slide.shapes.add_picture(p, E(e["x"] + (e["w"] - w) / 2), E(e["y"] + (e["h"] - h) / 2), E(w), E(h))
        return
    tb = slide.shapes.add_textbox(E(e["x"]), E(e["y"]), E(e["w"]), E(e["h"]))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE if e["anchor"] == "middle" else MSO_ANCHOR.TOP
    pars = e["text"].split("\n")
    for j, ptxt in enumerate(pars):
        para = tf.paragraphs[0] if j == 0 else tf.add_paragraph()
        para.alignment = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT}[e["align"]]
        para.line_spacing = e["lh"]
        if j < len(pars) - 1:
            para.space_after = Pt(e["size"] * 0.6 * e["gap"])
        for t, b in runs(ptxt):
            r = para.add_run()
            r.text = t
            f = r.font
            f.name = FONT_PPTX
            f.size = Pt(e["size"] * 0.6)  # 1 slide px = 0.6 pt
            f.bold = e["bold"] or b
            f.color.rgb = rgb((e.get("hl") or "ink") if b else e["color"])


def build_pptx(S, notes, out):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)
    cp = prs.core_properties
    cp.author = ""; cp.last_modified_by = ""; cp.title = "Siriva"; cp.subject = ""; cp.keywords = ""; cp.comments = ""
    total = len(S)
    for s in S:
        sl = prs.slides.add_slide(prs.slide_layouts[6])
        sl.background.fill.solid(); sl.background.fill.fore_color.rgb = rgb("bg")
        for e in s["els"] + chrome(s, total):
            pptx_el(sl, e)
        sl.notes_slide.notes_text_frame.text = notes.get(s["id"], "")
    prs.save(out)


# ---------------------------------------------------------------- fit check with Arial metrics (PPTX)
def fit_check(S):
    problems = []
    for s in S:
        for e in s["els"] + chrome(s, len(S)):
            if e["k"] != "text":
                continue
            f = ImageFont.truetype(TTF[e["bold"]], e["size"])
            lines = 0
            for par in e["text"].split("\n"):
                cur, n = "", 1
                for w_ in par.split(" "):
                    trial = (cur + " " + w_).strip()
                    if f.getlength(trial) > e["w"] and cur:
                        n += 1; cur = w_
                    else:
                        cur = trial
                lines += n
            npar = len(e["text"].split("\n"))
            need = lines * e["size"] * e["lh"] * 1.15 + (npar - 1) * e["size"] * e["gap"]
            if need > e["h"] + 2:
                problems.append((s["id"], f"{need:.0f}>{e['h']}", e["text"][:50]))
    return problems


def read_notes():
    p = os.path.join(PITCH, "SPEECH.md")
    notes, cur = {}, None
    if not os.path.exists(p):
        return notes
    for line in open(p, encoding="utf-8"):
        m = re.match(r"^## (\d\d)\b", line)
        if m:
            cur = m.group(1); notes[cur] = [line[3:].strip()]
            continue
        if line.startswith("## ") or line.startswith("# "):
            cur = None
            continue
        if cur:
            notes[cur].append(line.rstrip())
    return {k: re.sub(r"\n{3,}", "\n\n", "\n".join(v)).strip().replace("**", "") for k, v in notes.items()}


if __name__ == "__main__":
    S = slides()
    with open(os.path.join(PITCH, "Siriva-pitch.html"), "w", encoding="utf-8") as fh:
        fh.write(build_html(S))
    build_pptx(S, read_notes(), os.path.join(PITCH, "Siriva-pitch.pptx"))
    print("slides:", len(S))
    print("screens:", {k: bool(find_screen(k)) for k in SCREEN_CROP})
    print("objects:", {k: bool(find_object(k)) for k in OBJECTS})
    print("pptx fit problems:", fit_check(S) or "none")
