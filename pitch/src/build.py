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
TEAM = [("Shadil Nurmukhammed", "founder"), ("Amangeldiev Kaisar", "co-founder")]
EVENT = "Хакатон, ноябрь 2026"

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
         shadow="E6EBEF", white="FFFFFF", syn="45376A", syn_soft="ECE6F4")
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
        pinned = os.path.join(SITE_DIR, "landing-1440-fold.png")  # first screen of the landing
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


# ---------------------------------------------------------------- slides (composition after the JAZ deck)
def slides():
    S = []

    # 01 Cover (deep) ---------------------------------------------------
    els = [R(0, 0, W, H, fill="deep"),
           R(1180, -160, 520, 520, fill="teal", radius=260),
           SHOT(860, 170, 820, 512, "site"),
           T(MX, 96, 900, 30, "Хакатон, ноябрь 2026", size=23, bold=True, color="on_deep2", lh=1.0),
           T(MX, 150, 760, 240, BRAND, size=200, bold=True, color="white", lh=1.0),
           T(MX, 392, 720, 156, "Веб-платформа когнитивной реабилитации: **упражнения, которые измеряют.**",
             size=36, bold=True, color="white", lh=1.22, hl="on_deep2"),
           T(MX, 556, 700, 124, "Короткие ежедневные упражнения по речи; профиль из пяти функций и подбор следующих заданий по предсказанной нагрузке.",
             size=24, color="on_deep2", lh=1.4),
           T(MX, 712, 760, 80, "\n".join(f"{n}, {r}" for n, r in TEAM), size=24, bold=True, color="white", lh=1.35, gap=0)]
    S.append(dict(id="01", sec=None, dark=True, els=els))

    # 02 Problem (white) ------------------------------------------------
    els = [title("Проблема"),
           lead("Изменения замечают поздно. **А упражнения подбирают на глаз.**", h=90),
           card(MX, 300, 600, 300),
           R(MX + 30, 330, 40, 40, fill="deep", radius=20),
           T(MX + 30, 336, 40, 28, "!", size=23, bold=True, color="white", align="center", lh=1.0),
           T(MX + 90, 330, 480, 250, "Близкие часто замечают изменения, когда они уже очевидны. До этого их никто систематически не измеряет.",
             size=26, bold=True, color="ink", lh=1.4)]
    items = [("Разметка на глаз", "задания подписаны «на память» или «на внимание», метод разметки не показан."),
             ("Адаптация по баллу", "«8 из 10» не покажет, что ответ стал втрое медленнее [1]."),
             ("Трудное снова и снова", "при трудностях с речью человек всё равно получает речевые задания.")]
    y = 300
    for i, (h1, body) in enumerate(items):
        els += [card(MX + 640, y, 768, 92)] + circle(MX + 664, y + 24, i + 1) + [
                T(MX + 728, y + 16, 660, 70, f"**{h1}:** {body}", size=23, color="ink2", lh=1.32, hl="ink")]
        y += 104
    els += banner(640, "Siriva измеряет речь в самих упражнениях и подбирает следующие **адресно, а не по баллу.**")
    S.append(dict(id="02", sec="Проблема", els=els, foot=["[1] Условный пример, не измерение."]))

    # 03 Evidence: stat cards + banner ----------------------------------
    els = [title("Доказательства")]
    stats = [("7,6", "года", "В Framingham по письменному описанию картинки удалось предсказать начало болезни Альцгеймера (AUC 0,74).", "[1] одна когорта, тест 80 человек"),
             ("475", "человек", "Когнитивная реабилитация с личными целями помогает людям на ранней стадии достигать выбранных целей в быту.", "[2] GREAT, очно, с терапевтом"),
             ("2 млн", "долларов", "Lumosity, 2016: мировое соглашение с FTC по необоснованным заявлениям о пользе тренировок.", "[3] не вывод суда о вине")]
    cw, g = (1408 - 48) // 3, 24
    for i, (num, unit, body, src) in enumerate(stats):
        x = MX + i * (cw + g)
        els += [card(x, 200, cw, 420),
                T(x + 30, 226, cw - 60, 110, num, size=96, bold=True, color=["teal", "navy", "navy"][i], lh=1.0),
                T(x + 30, 340, cw - 60, 34, unit, size=28, bold=True, color="ink", lh=1.0),
                T(x + 30, 390, cw - 60, 170, body, size=23, color="ink2", lh=1.38),
                T(x + 30, 568, cw - 60, 34, src, size=23, color="ink3", lh=1.2)]
    els += banner(648, "Язык чувствителен к ранним изменениям, а реабилитация с целями работает. **Обещать больше, чем доказано, нельзя.**")
    S.append(dict(id="03", sec="Проблема", els=els, foot=[
        "[1] Eyigoz E. et al., EClinicalMedicine 2020, DOI 10.1016/j.eclinm.2020.100583.",
        "[2] Clare L. et al., GREAT, Int J Geriatr Psychiatry 2019, DOI 10.1002/gps.5076.",
        "[3] FTC, пресс-релиз 05.01.2016: Lumos Labs, 2 млн долларов."]))

    # 04 Solution: numbered layers + landing/screen ---------------------
    l3 = ("Речевую и внимательную нагрузку предсказывает TRIBE v2 (Meta) [1]; память и скорость по типу задания."
          if TRIBE_DONE else "25 упражнений прогоняем через TRIBE v2 (Meta) [1]; сейчас нагрузка предварительная.")
    els = [title("Решение"),
           lead("Каждое упражнение **одновременно измеряет.**", h=50)]
    layers = [("Упражнение как измерение", "Описание картинки, называние за минуту, пересказ сразу и через 20 минут; паузы и задержки фоном."),
              ("Профиль из пяти функций", "Память на события, подбор слов, построение фраз, внимание, скорость ответа: по микрометрикам."),
              ("Подбор по предсказанной нагрузке", l3)]
    y = 248
    for i, (h1, body) in enumerate(layers):
        els += [card(MX, y, 700, 156)] + circle(MX + 24, y + 22, i + 1) + [
                T(MX + 88, y + 18, 590, 34, h1, size=26, bold=True, lh=1.15),
                T(MX + 88, y + 52, 590, 104, body, size=23, color="ink2", lh=1.3)]
        y += 164
    els += [SHOT(MX + 740, 248, 668, 484, "site"),
            *capsule(MX + 764, 670, "Сайт Siriva" if find_screen("site") != find_screen("d2") else "Живая запись в /demo")]
    els += banner(750, "Модель мозга описывает **свойства упражнений, а не человека.** Человека измеряем только по речи и поведению.", h=88)
    S.append(dict(id="04", sec="Решение", els=els, foot=["[1] d'Ascoli S. et al., TRIBE v2, arXiv 2605.04326, 2026. Лицензия CC BY-NC 4.0."]))

    # TRIBE v2 cortex maps -----------------------------------------------
    TR = os.path.join(PITCH, "assets", "tribe")
    els = [title("Как TRIBE v2 видит упражнения"),
           T(MX, 184, 1408, 80, "Предсказание TRIBE v2 для каждого упражнения по 20 484 точкам коры. У речевых заданий выше отклик **в височной коре слева, в контуре языковой сети.**",
             size=24, color="ink", lh=1.35, hl="teal"),
           card(MX, 270, 900, 500, fill="white"),
           T(MX + 26, 286, 848, 30, "Речевые минус зрительные задания (9 против 11)", size=23, bold=True, color="navy", lh=1.1),
           IMG(MX + 16, 326, 868, 428, os.path.join(TR, "diff_lateral.png"))]
    for j, (lab, f) in enumerate([("Речевое: пересказ рассказа", "speech_lateral.png"),
                                   ("Зрительное: повторить последовательность на поле", "visual_lateral.png")]):
        y = 270 + j * 256
        els += [card(MX + 924, y, 484, 244, fill="white"),
                T(MX + 948, y + 12, 436, 66, lab, size=23, bold=True, color="navy", lh=1.2),
                IMG(MX + 940, y + 80, 452, 156, os.path.join(TR, f))]
    els += banner(786, "Модель усреднённого мозга по звуку и тексту стимула, **не измерение человека.** TRIBE v2 (Meta), fsaverage5.", h=84)
    S.append(dict(id="xx", sec="Решение", els=els))

    # 05 Before / now table ---------------------------------------------
    els = [title(f"Тренажёры и {BRAND}")]
    cols = [(MX, 300, "Критерий"), (MX + 300, 520, "Популярные тренажёры"), (MX + 820, 588, BRAND)]
    rows = [("Разметка упражнений", "Категории «память», «внимание»; у CogniFit метод разметки не раскрыт [2]",
             "Речевую и внимательную нагрузку предсказывает TRIBE v2, память и скорость по типу задания" if TRIBE_DONE else
             "Предсказанная нагрузка по пяти функциям (TRIBE v2, сейчас предварительная)"),
            ("Адаптация", "По результатам заданий и сравнению с другими пользователями [2]", "По микрометрикам речи и времени ответа"),
            ("Ослабленная функция", "Усиливают слабые навыки [2]", "Цель тренируется через сохранный канал, трудная функция бережётся"),
            ("Заявления о пользе", "Lumosity, 2016: мировое соглашение с FTC на 2 млн долларов по необоснованным заявлениям [1]",
             "Не обещаем лечения; на экране видно, что измерено, а что предварительно")]
    ty, hh, rh = 196, 58, 128
    th = hh + rh * len(rows)
    els += [card(MX, ty, 1408, th),
            R(cols[2][0], ty + 1, cols[2][1] - 1, th - 2, fill="teal_soft", radius=RAD),
            R(cols[2][0], ty + 1, 40, th - 2, fill="teal_soft")]
    for x, w, lab in cols:
        els.append(T(x + 24, ty + 16, w - 48, 30, lab.upper() if lab != BRAND else lab, size=23, bold=True, color="teal" if lab == BRAND else "ink3", lh=1.0))
    y = ty + hh
    for a, b, c in rows:
        els += [R(MX + 24, y, 1408 - 48, 1, fill="line"),
                T(cols[0][0] + 24, y + 18, cols[0][1] - 48, rh - 22, a, size=23, bold=True, lh=1.3),
                T(cols[1][0] + 24, y + 18, cols[1][1] - 48, rh - 22, b, size=23, color="ink2", lh=1.3),
                T(cols[2][0] + 24, y + 18, cols[2][1] - 48, rh - 22, c, size=23, bold=True, color="teal", lh=1.3)]
        y += rh
    S.append(dict(id="05", sec="Как работает", els=els, foot=[
        "[1] FTC, пресс-релиз 05.01.2016: мировое соглашение Lumos Labs, 2 млн долларов; не вывод суда о вине.",
        "[2] CogniFit, страница Individualized Training System, проверено 14.11.2026."]))

    # 06 How it looks: 2x2 screenshots with dark captions ----------------
    els = [title("Как это выглядит")]
    grid = [("d2", "Рис. 1. Запись: паузы и задержки видны сразу"),
            ("d3", "Рис. 2. Профиль: 0,41 → 0,62 с, 18 → 13 слов"),
            ("d4", "Рис. 3. Обходной путь: одна цель, разные программы"),
            ("d5", "Рис. 4. Близкий: тренд, а не вывод")]
    gw, gh, gx, gy = 692, 290, 24, 20
    for i, (key, cap) in enumerate(grid):
        x = MX + (i % 2) * (gw + gx)
        y = 194 + (i // 2) * (gh + gy)
        els += [SHOT(x, y, gw, gh, key), *capsule(x + 18, y + gh - 62, cap)]
    els.append(T(MX, 806, 1408, 30, "Живое демо: /demo, около двух минут. Пациенты синтетические, запись живая.", size=23, color="ink2", lh=1.0))
    S.append(dict(id="06", sec="Демонстрация", els=els))

    # 07 Main frame: bypass (deep) ---------------------------------------
    els = [R(0, 0, W, H, fill="deep"),
           title("Главный кадр: обходной путь", color="white"),
           T(MX, 196, 520, 120, "Одна цель. **Разные дороги.**", size=44, bold=True, color="white", lh=1.15, hl="on_deep2"),
           T(MX, 330, 520, 330,
             "У А и Б одинаково снижена память на события.\n"
             "А: речь сохранна, в программе есть «Пересказ рассказа».\n"
             "Б: речь снижена, память идёт через зрение и пространство, речевые задания система обходит.",
             size=24, color="on_deep", lh=1.4, gap=0.6),
           T(MX, 676, 520, 112, "Речевую и внимательную нагрузку предсказывает TRIBE v2; память и скорость по типу задания." if TRIBE_DONE else
             "Нагрузка пока предварительная, по типу задания.", size=23, color="on_deep2", lh=1.35),
           SHOT(660, 196, 844, 528, "d4")]
    els += pill(660, 748, SYN, fg="deep", bg="on_deep2")
    S.append(dict(id="07", sec="Демонстрация", dark=True, els=els))

    # 08 Results: stat cards ---------------------------------------------
    els = [title("Результаты"),
           T(MX, 182, 1408, 32, "Рис. 5. Точность на ADReSS 2020: описание картинки, английская речь, тест 48 человек (1 человек = 2,1 п. п.)",
             size=23, color="ink2", lh=1.2)]
    nums = [("75 %", 75.0, "Бейзлайн организаторов [1]"), ("85,4 %", 85.4, "Логрегрессия на понятных признаках [2]"),
            ("89,6 %", 89.6, "Лучший результат [3]")]
    cw, g = (1408 - 72) // 4, 24
    for i, (v, pv, lab) in enumerate(nums):
        x = MX + i * (cw + g)
        els += [card(x, 228, cw, 210),
                T(x + 26, 248, cw - 52, 84, v, size=72, bold=True, color="navy", lh=1.0),
                R(x + 26, 342, cw - 52, 8, fill="card2", radius=4),
                R(x + 26, 342, int((cw - 52) * pv / 100), 8, fill="navy", radius=4),
                T(x + 26, 364, cw - 52, 70, lab, size=23, color="ink2", lh=1.3)]
    x = MX + 3 * (cw + g)
    els += [R(x, 228, cw, 210, fill="white", line="line_strong", lw=2, dash=True, radius=RAD),
            T(x + 26, 250, cw - 52, 60, ADRESS_OURS or "ждёт данных", size=72 if ADRESS_OURS else 40, bold=True,
              color="teal" if ADRESS_OURS else "ink2", lh=1.15),
            T(x + 26, 318, cw - 52, 34, BRAND, size=23, bold=True, lh=1.2),
            T(x + 26, 356, cw - 52, 76, "Доступа к DementiaBank пока нет" if not ADRESS_OURS else "Модель на признаках речи",
              size=23, color="ink2", lh=1.3)]
    els += [R(MX, 462, 1408, 300, fill="teal_soft", radius=RAD),
            T(MX + 36, 486, 600, 32, "TRIBE v2 и оценка по типу задания", size=23, bold=True, lh=1.2),
            T(MX + 36, 526, 300, 150, AGREEMENT or "в работе", size=120 if AGREEMENT else 44, bold=True,
              color="teal" if AGREEMENT else "ink2", lh=1.0),
            T(MX + 36, 680, 380, 72, "Спирмен, среднее по трём функциям, 25 упражнений" if AGREEMENT else "прогон TRIBE v2 идёт",
              size=23, color="ink2", lh=1.3)]
    if AGREEMENT:
        bars = [("Подбор слов", 0.88), ("Построение фраз", 0.68), ("Внимание", 0.03)]
        bx, bw = MX + 470, 640
        for j, (lab, v) in enumerate(bars):
            yy = 500 + j * 62
            els += [T(bx, yy, 240, 30, lab, size=23, color="ink", lh=1.0),
                    R(bx + 250, yy + 6, bw - 250, 18, fill="white", radius=9),
                    R(bx + 250, yy + 6, max(6, int((bw - 250) * v)), 18, fill="teal", radius=9),
                    T(bx + bw + 16, yy, 120, 30, f"{v:.2f}".replace(".", ","), size=23, bold=True, color="teal", lh=1.0)]
        els.append(T(bx, 690, 860, 70, "Речевые и зрительные задания разделяются (rbc +1,0). Разметки специалистов пока нет.",
                     size=23, color="ink2", lh=1.3))
    S.append(dict(id="08", sec="Результаты", els=els, foot=[
        "[1] Luz S. et al., Interspeech 2020, arXiv 2004.06833.   [2] Front. Comput. Sci. 2021, DOI 10.3389/fcomp.2021.624659.",
        "[3] Yuan J. et al., Interspeech 2020 (BERT/ERNIE и паузы)."]))

    # 09 Honest boundaries: 3 numbered cards + banner -------------------
    els = [title("Честно о границах")]
    hon = [("01", "Данные", "Пациенты в демо синтетические, проверки на людях не было. Готовая исследовательская модель для ADReSS подключена, её точность не подтверждена [1]."),
           ("02", "Модель мозга", "Память и скорость пока по типу задания. TRIBE v2 взят по звуку и тексту на английском, обучен на 25 здоровых взрослых; по вниманию совпадение низкое (0,03) [2]."),
           ("03", "Голос и выводы", "Сырое аудио удаляется после распознавания, хранятся признаки. Близкий видит тренд, а не вывод; решения принимает специалист.")]
    cw, g = (1408 - 48) // 3, 24
    for i, (n, h1, body) in enumerate(hon):
        x = MX + i * (cw + g)
        els += [card(x, 200, cw, 440),
                T(x + 30, 226, 120, 34, n, size=26, bold=True, color="navy", lh=1.0),
                T(x + 30, 270, cw - 60, 40, h1, size=30, bold=True, lh=1.15),
                T(x + 30, 326, cw - 60, 300, body, size=23, color="ink2", lh=1.4)]
    els += banner(668, f"{BRAND} **не делает медицинских выводов.** Прототип некоммерческий, TRIBE v2 под лицензией CC BY-NC 4.0.")
    S.append(dict(id="09", sec="Результаты", els=els, foot=[
        "[1] Модель xlm-roberta (vjsyong) на Hugging Face; её точность нами не проверялась.   [2] d'Ascoli S. et al., arXiv 2605.04326."]))

    # Doctor review ------------------------------------------------------
    els = [title("Отзыв врача"),
           card(MX, 196, 1000, 540, fill="teal_soft"),
           T(MX + 36, 206, 120, 130, "«", size=110, bold=True, color="teal", lh=1.0),
           T(MX + 40, 320, 920, 290,
             "Подтверждаю работоспособность представленной версии платформы… Высоко оцениваю научно-практический потенциал Siriva… "
             "рекомендую его поддержку на конкурсном этапе **с последующей пилотной апробацией при участии медицинских специалистов.**»",
             size=30, bold=False, color="ink", lh=1.38, hl="teal"),
           R(MX + 40, 636, 880, 1, fill="line_strong"),
           T(MX + 40, 652, 920, 70, "Шәділ Мөлдір, врач городской поликлиники № 2 г. Тараз, 14.11.2026",
             size=24, bold=True, color="ink", lh=1.3),
           card(MX + 1024, 196, 384, 540, fill="white"),
           IMG(MX + 1046, 212, 340, 468, os.path.join(PITCH, "assets", "validation", "doctor-review-thumb.jpg")),
           T(MX + 1046, 690, 340, 34, "Скан с подписью и печатью", size=23, color="ink3", align="center", lh=1.2)]
    els += banner(756, "«Клиническая эффективность платформы подлежит отдельной оценке» (из отзыва). **Один отзыв о прототипе, не клиническое исследование.**", h=90)
    S.append(dict(id="xx", sec="Результаты", els=els))

    # 10 Next steps -----------------------------------------------------
    els = [title("Дальнейшие шаги"),
           lead("Казахский и русский: **открытых наборов речи с когнитивными нарушениями мы не нашли [1].**", h=90, size=32)]
    road = [("Пилот", "апробация при участии врачей; первый отзыв врача получен"),
            ("Проверка", "сравнение с нейропсихологическим обследованием"),
            ("Языки", "казахский и русский в речевом слое"),
            ("Стимулы", "генерация упражнений под профиль нагрузки")]
    cw, g = (1408 - 72) // 4, 24
    for i, (h1, body) in enumerate(road):
        x = MX + i * (cw + g)
        els += [card(x, 320, cw, 300, fill="teal_soft" if i == 2 else "card")] + circle(x + 26, 346, i + 1, fill="teal" if i == 2 else "navy") + [
                T(x + 26, 410, cw - 52, 36, h1, size=30, bold=True, color="ink", lh=1.1),
                T(x + 26, 460, cw - 52, 150, body, size=23, color="ink2", lh=1.38)]
        if i < 3:
            els.append(T(x + cw - 2, 450, 28, 30, "→", size=26, bold=True, color="line_strong", align="center", lh=1.0))
    els += banner(648, "Речевые маркеры зависят от языка. **Набор для казахской речи придётся собирать вместе с клиникой.**")
    S.append(dict(id="10", sec="Дальнейшие шаги", els=els, foot=[
        "[1] Поиск 14.11.2026 (es/docs/RESEARCH-ACCESS-TRIBE.md, 1.4). «Не нашли» не означает, что их нет."]))

    # 11 Team and ask (deep) --------------------------------------------
    els = [R(0, 0, W, H, fill="deep"),
           R(1200, 560, 560, 560, fill="teal", radius=280),
           title("Команда и запрос", color="white"),
           T(MX, 220, 440, 30, "Команда", size=23, bold=True, color="on_deep2", lh=1.0)]
    y = 270
    for n, r in TEAM:
        els += [T(MX, y, 480, 44, n, size=34, bold=True, color="white", lh=1.15),
                T(MX, y + 50, 480, 30, r, size=23, color="on_deep2", lh=1.0)]
        y += 130
    ax, aw = MX + 560, 848
    els += [T(ax, 220, aw, 30, "Что нам нужно", size=23, bold=True, color="on_deep2", lh=1.0)]
    asks = [("Научный руководитель", "вуза или клиники: доступ к DementiaBank выдают только по его заявке."),
            ("Клиника-партнёр", "для пилота на 20-30 человек и сравнения с обследованием специалиста."),
            ("Взгляд специалистов", "на упражнения, формулировки и экран близкого.")]
    y = 270
    for i, (h1, body) in enumerate(asks):
        els += circle(ax, y, i + 1, fill="teal") + [
                T(ax + 64, y + 4, aw - 64, 40, h1, size=30, bold=True, color="white", lh=1.1),
                T(ax + 64, y + 48, aw - 64, 70, body, size=23, color="on_deep2", lh=1.3)]
        y += 140
    els.append(T(MX, 780, 900, 50, "Спасибо", size=44, bold=True, color="white", lh=1.0))
    S.append(dict(id="11", sec="Команда и запрос", dark=True, els=els))
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
.shot{{border:1px solid #{C['line']};border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 2px 6px rgba(19,32,46,.06),0 18px 44px rgba(19,32,46,.14)}}
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
            pptx_el(slide, R(e["x"] + 2, e["y"] + 10, e["w"], e["h"], fill="shadow", radius=20))
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
