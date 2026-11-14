# Отчет: запасной прогон TRIBE v2 на Mac (промежуточный, только аудио)

Статус на 19:55: посчитана модальность audio для всех 25 упражнений. Текст считается (см. ниже), видео не посчитано.

## Железо и окружение
- Apple M5, 16 ГБ общей памяти, MPS есть (torch 2.6.0), окружение `es/tribe/.venv-mac`, Python 3.13 (tribev2 требует 3.11 и выше, на Mac только 3.10 и 3.13). ffmpeg: imageio-ffmpeg из PyPI, симлинк в `mac/bin/` (в git не идет).
- Модель: `facebook/tribev2` (best.ckpt, не gated), только кора fsaverage5 (20 484 вершины), подкорки и гиппокампа в публичном выходе нет.
- Экстракторы (Wav2Vec-BERT, Llama) работают на CPU: `device` в neuralset принимает только auto/cpu/cuda/accelerate. Сама модель TRIBE на MPS. Исходники tribev2 не менялись.

## Что посчитано, что нет
| Модальность | Статус |
|---|---|
| audio | посчитано, 25 из 25 (около 1 мин на стимул, в основном загрузка Wav2Vec-BERT) |
| text | считается в фоне (Llama-3.2-3B, зеркало unsloth, bf16 на CPU); fp16 на MPS и accelerate дали NaN и дисковую выгрузку, от них отказались. Только 12 речевых упражнений имеют текст по смыслу задания |
| video | не посчитано (V-JEPA 2 Giant на CPU, 16 ГБ общей памяти), генератор `mac/make_video.py` готов, не запускался |

Файлы признаков: `features/audio/<id>.npy` (в git не идут).

## Стимулы (`stimuli/manifest.json`, `mac/make_stimuli.py`)
- Русский голос Milena (macOS `say`), 16 кГц wav, 8-39 с. Для 10 упражнений с речью и материалом: инструкция плюс озвученный материал. Для 3 слуховых (звук, ритм, сигнал): инструкция плюс синтетические тоны. Для 12 зрительных и моторных: только озвучка инструкции.
- Важное ограничение: у зрительных и моторных упражнений стимул в аудио-матрице это инструкция, а не само задание. Их значения описывают речь инструкции и непригодны как нагрузка задания, пока нет видео.
- Тайминги слов приближенные (пропорционально числу символов), не распознанные ASR (whisperx через uvx недоступен, uv нет).
- Клипы короткие (8-39 с), после отбрасывания первых 5 с остается 3-30 отсчетов.
- Модель обучена на английском, французском, испанском, нидерландском и китайском, русская речь вне обучающего распределения.

## Метод агрегации (`mac/aggregate.py`, `mac/atlas_masks.py`)
Среднее предсказание по вершинам домена, первые 5 с отброшены, z по 25 стимулам, обрезка в [-2, 2], (z+2)/4. Несколько модальностей усредняются. Маски: Schaefer-2018 400 областей, сгруппированных в 7 сетей Yeo (Yeo 2011 по FTP недоступен), и атлас Destrieux на fsaverage5.
- episodic_memory: сеть Default плюс парагиппокампальная, предклинье, задняя поясная. Низкая надежность, гиппокампа нет.
- word_access: левая нижняя лобная (треугольная, орбитальная) и левая височная.
- phrase_building: левая нижняя лобная (покрышечная, треугольная), височная, угловая. Пересекается с word_access.
- attention: Dorsal, Ventral Attention, Frontoparietal.
- processing_speed: не мозговая величина, ранговый прокси темпа стимула (слов в секунду, тонов в секунду).

## Корреляции Спирмена с заглушкой, audio-only (n = 25)
| Домен | rho | p |
|---|---|---|
| episodic_memory | 0.17 | 0.418 |
| word_access | 0.02 | 0.909 |
| phrase_building | 0.16 | 0.440 |
| attention | 0.23 | 0.272 |
| processing_speed | -0.20 | 0.342 |

Значимых связей нет. Для этого набора это ожидаемо: стимул это озвучка инструкции, а не задание.

## Выход и проверки
- `out/load_matrix.tribe_v2.mac.audio-only.json` (копия `out/load_matrix.tribe_v2.mac.json`; при завершении текстового прогона файл `.mac.json` заменяется матрицей audio+text, `.audio-text.json`). Модальности указаны в `metadata.modalities_computed`.
- Бэкенд: `cd es/backend && ES_LOAD_MATRIX=./tribe/out/load_matrix.tribe_v2.mac.audio-only.json .venv/bin/python -m pytest -q`: проходит.

## Лицензии
TRIBE v2: CC BY-NC 4.0 (Meta FAIR, d'Ascoli et al. 2026, arXiv 2605.04326), только некоммерческий прототип. Built with Llama: веса из открытого зеркала unsloth/Llama-3.2-3B (config совпадает: 28 слоев, hidden 3072, vocab 128256), Llama 3.2 Community License.

## Воспроизведение
`cd es/tribe && .venv-mac/bin/python mac/make_stimuli.py && .venv-mac/bin/python mac/atlas_masks.py && .venv-mac/bin/python mac/run_predict.py audio && .venv-mac/bin/python mac/aggregate.py out/x.json audio && .venv-mac/bin/python mac/validate.py out/x.json`. Текст: `mac/finish_text.sh`.
