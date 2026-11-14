# Siriva (рабочее название Es): питч для жюри

- `Siriva-pitch.pptx`: редактируемая презентация, 8 слайдов, композиция по деку JAZ (слайд 04: карты коры из es/tribe/viz, копии в assets/tribe; прошлая версия на 13 слайдов: scratchpad build-13.py), заметки докладчика берутся из `SPEECH.md`. Шрифт в PPTX: Arial.
- `Siriva-pitch.pdf`: версия для показа, Golos Text, клинический стиль (es/docs/DESIGN-MEDTECH.md, разделы 11-12).
- `SPEECH.md`: речь на 4 минуты с таймингом. `QA.md`: неудобные вопросы.
- `preview/slide-NN.png`: превью каждого слайда.

## Пересборка (без GUI-приложений)

```bash
cd es/pitch
node src/snap.mjs "$PWD/assets/screens-src"   # скриншоты /demo с http://127.0.0.1:3000 (headless Chrome)
python3 src/build.py                 # HTML + PPTX, проверка переполнения текста
src/shots.sh                         # PNG-превью через headless Chrome
node ../../tools/pdf.mjs "file://$PWD/Siriva-pitch.html" "$PWD/Siriva-pitch.pdf"
```

## Что меняется в `src/build.py`
- `BRAND`, `AGREEMENT`, `AGREEMENT_DETAIL`, `TRIBE_DONE` (гибрид: речь и внимание из TRIBE v2).
- `ADRESS_OURS`: наша точность на ADReSS, когда будет доступ к DementiaBank.
- `TEAM`: имена и роли команды.
- `SCREEN_CROP`: какие скриншоты из `es/web/docs/screens` брать (копии в `assets/screens`). Скриншот лендинга берётся из `es/web/docs/site/` (первый png или jpg), пока его нет, стоит `/demo`.
