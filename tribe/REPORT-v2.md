# Отчёт: полный прогон TRIBE v2 на Mac, английские стимулы (v2)

Дата: 14.11.2026. Исполнитель: backend (ML), отчёт сохранила главная сессия.

**Итог.** Посчитаны звук и текст на английском. Видео остановлено по решению пользователя, в матрицу не входит. В продукте стоит гибрид `es/tribe/out/load_matrix.hybrid.json`: речь и внимание из TRIBE v2, память и скорость из оценки по типу задания.

## Что посчитано
- **Стимулы** `es/tribe/stimuli-v2/` (старые `stimuli/` целы): английский, голос macOS `say` Samantha, 16 кГц. Речевые задания 36-54 с, рассказ lantern-keeper-en целиком. Остальные 42-46 с: короткая инструкция, дальше тишина или тоны, как в реальном задании. Тайминги слов настоящие, по faster-whisper small; в Llama идёт транскрипт распознавания.
- **Звук** (Wav2Vec-BERT, CPU): 25 из 25, около 15 с на стимул.
- **Текст** (Llama-3.2-3B, bf16, зеркало unsloth): 9 речевых упражнений. У остальных 16 текста по смыслу нет.
- **Видео** (V-JEPA 2 ViT-g, MPS bf16): рендер хода задания для 18 упражнений написан, посчитано 13 клипов по 20 с при 16 кадрах (при 64 MPS уходил в своп). В итоговые матрицы видео не входит. `out/load_matrix.tribe_v2.en.partial.json` только для справки.

## Скорость
- Текст на MPS в bf16 с `attn_implementation=eager` даёт конечные значения (с sdpa на MPS и с fp16 были NaN). Около 0,5 с на слово против 4 с и более на CPU.
- MPS и CPU совпадают не полностью (корреляция по всем значениям 0,85, по среднему по вершинам 0,40, проверено на одном стимуле): шум bf16 на разных устройствах.

## Метод
Как в `REPORT-mac.md`: среднее предсказание по вершинам домена, первые 5 с отброшены; z по стимулам модальности, обрезка [-2, 2], (z+2)/4; модальности упражнения усредняются; атласы Schaefer-400 (7 сетей Yeo) и Destrieux на fsaverage5. `processing_speed` остаётся прокси темпа стимула, не мозговая величина.

## Валидация матрицы звук+текст (`out/load_matrix.tribe_v2.en.audio-text.json`)

**1. Спирмен против оценки по типу задания (n = 25)**

| домен | rho | p |
|---|---|---|
| episodic_memory | 0,10 | 0,635 |
| word_access | 0,88 | <0,001 |
| phrase_building | 0,68 | <0,001 |
| attention | 0,03 | 0,883 |
| processing_speed | -0,61 | 0,001 |

На русских звуке и тексте (прогон v1) было от -0,20 до 0,18.

**2. Известные группы**: речевые (9) против зрительных, пространственных и моторных (11), группы по каналу упражнения. Манн-Уитни односторонний, rbc = ранг-бисериальный размер эффекта.

| домен | ожидание | среднее речь / зрит. | rbc | p |
|---|---|---|---|---|
| word_access | речь выше | 0,65 / 0,30 | +1,00 | <0,001 |
| phrase_building | речь выше | 0,65 / 0,30 | +1,00 | <0,001 |
| attention | зрит. выше | 0,40 / 0,66 | +0,76 | 0,002 |
| сеть Visual (диагностика) | зрит. выше | 0,63 / 0,33 | -0,86 | 0,999 |

Сеть Visual не подтвердилась: в звуке и тексте зрительного входа нет. На 13 посчитанных видеоклипах V-JEPA поднимает активацию сети Visual (0,13 против -0,08 у звука тех же упражнений), полную проверку не довели.

## Оговорки
- Разделение по word_access и phrase_building во многом означает «есть ли речь в звуке». Согласие с разметкой отчасти потому, что разметка тоже ставит речь выше.
- attention по группам сходится, внутри групп разметке не следует (rho 0,03). Не подгонялось.
- episodic_memory: гиппокампа в публичном выходе нет, rho 0,10. Не использовать как меру памяти.
- processing_speed: -0,61, это прокси темпа, не использовать.

## Решение для продукта
Гибрид собирается скриптом `es/backend/scripts/build_hybrid_matrix.py`:
```
cd .
PYTHONPATH=backend backend/.venv/bin/python backend/scripts/build_hybrid_matrix.py \
  --tribe tribe/out/load_matrix.tribe_v2.en.audio-text.json \
  --validation tribe/mac/work/v2_val_audio_text.md
```
word_access, phrase_building, attention из TRIBE v2; episodic_memory и processing_speed из `es/backend/es_core/data/load_matrix.placeholder.json`. `es/start-demo.sh` подхватывает гибрид по умолчанию. Согласованность на экране D6: 0,53 (среднее по трём TRIBE-доменам). Матрицу TRIBE целиком, без гибрида, в продукт не подключать: обходной путь ломается (у пациента Б пустая программа).

Лицензии: TRIBE v2 CC BY-NC 4.0 (только некоммерческий прототип). Built with Llama (Llama 3.2 Community License, веса из открытого зеркала unsloth/Llama-3.2-3B).

## Как пересобрать матрицу (из `es/tribe`)
```
./backend/.venv/bin/python mac/v2/make_audio.py
.venv-mac/bin/python mac/v2/run_predict.py audio
TRIBE_TEXT_DEV=mps TRIBE_ATTN=eager .venv-mac/bin/python mac/v2/run_text.py
.venv-mac/bin/python mac/v2/extra_masks.py
.venv-mac/bin/python mac/v2/aggregate.py out/load_matrix.tribe_v2.en.audio-text.json audio text
.venv-mac/bin/python mac/v2/validate.py out/load_matrix.tribe_v2.en.audio-text.json mac/work/v2_val_audio_text.md
```
Видео при необходимости: `mac/v2/make_video.py`, затем `TRIBE_VID_FRAMES=16 mac/v2/run_video.py` на клипах `stimuli-v2/video20/`.
