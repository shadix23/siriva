# Siriva API: контракт v0.3 (черновик для экранов и фронтенда)

## Что изменилось в v0.4 (исследовательский классификатор, демонстрация)

Совместимо назад, добавлены поля.
- В ответе `/audio` и `/transcript` для `picture_description` на английском блок `research_classifier` (поля ниже), для русского `research_classifier: null` и причина `research_classifier_reason` (`english_only`) с русским текстом `research_classifier_reason_ru`. Блок только для экранов демо и жюри: на D2 после записи и на D6. **Результат не попадает** в признаки, профиль, программу, траекторию и экраны пациента и близкого.
- `/demo/numbers`: в блоке `adress` поле `research_model` (метаданные без оценки). Собственный результат (`accuracy`, `test_n`, `baseline`) по-прежнему как был, `status: pending`.
- `/health`: `research_classifier_state` (`disabled`, `cold`, `warming`, `ready`, `error`) и `research_classifier_ready`.

### Исследовательский классификатор (демонстрация конвейера)

Подключена готовая модель `vjsyong/xlm-roberta-dementia_detection` (Hugging Face, лицензия MIT, текстовая, база xlm-roberta-base) как **демонстрация**, не как наш результат и не как медицинское заключение. Оговорки: данные обучения неизвестны, заявлена только точность на обучающих данных 0,896 (проверочная ошибка высокая, признаки переобучения), проверочной оценки нет, карточка не поясняет класс `POSITIVE` (мы читаем его как «паттерн нарушений», это допущение), модель не проверялась на русском. Работает только с английской речью. Время оценки около 0,2 с.

Ответ (`picture_description`, `language: "en"`), добавляется к обычным полям:
```json
{"research_classifier": {"model": "vjsyong/xlm-roberta-dementia_detection", "model_display": "xlm-roberta (vjsyong), исследовательская модель",
   "license": "MIT", "score": 0.994, "class_code": "pattern", "class_ru": "паттерн нарушений",
   "label_ru": "Исследовательская модель, точность не подтверждена. Не медицинское заключение",
   "reported": "заявлена только точность на обучающих данных 0,896, проверочной оценки нет",
   "language": "en", "elapsed_ms": 187}}
```
- `score` вероятность класса «паттерн нарушений» (0..1), `class_code` `pattern` при `score >= 0,5`, иначе `control` («контроль»).
- На экранах показывать `model_display`, `class_ru`, `label_ru` и `reported` рядом с оценкой, не показывать техническое поле `model` (в нём исходное имя модели на Hugging Face).
- Для русского: `{"research_classifier": null, "research_classifier_reason": "english_only", "research_classifier_reason_ru": "Модель только для английской речи"}`. Другие причины `null`: `model_not_ready` (ещё прогревается), `disabled`, `error`. Упражнение при этом засчитывается как обычно.

`/demo/numbers`:
```json
{"adress": {"status": "pending", "accuracy": null, "test_n": 48, "baseline": 0.75, "baseline_source": "...",
            "research_model": {"model": "vjsyong/xlm-roberta-dementia_detection", "model_display": "xlm-roberta (vjsyong), исследовательская модель",
                               "license": "MIT", "label_ru": "Исследовательская модель, точность не подтверждена. Не медицинское заключение",
                               "reported": "заявлена только точность на обучающих данных 0,896, проверочной оценки нет",
                               "language": "en", "role": "demo", "own_result": false, "ready": true, "state": "ready"}}}
```

## Что изменилось в v0.3 (IRT, повторы, модель распознавания)

Совместимо назад: все прежние поля на месте, добавлены новые.
- **IRT для сложности.** Уровень каждого пункта программы теперь выбирает модель Раша (1PL) по результатам пациента в домене: у пункта `difficulty` (1-5), `predicted_success` (предсказанная вероятность успеха, цель около 0,75) и `difficulty_source` (`irt` или `rule`). При меньше чем 3 результатах в домене работает прежнее правило 70-80% (`rule`). В ответе программы верхнего уровня `ability` (способность по доменам).
- **Модель забывания.** В программе `reviews`: что пора повторить и почему (`predicted_recall`, `next_review_at`, `due`, `reason_code`, `reason`). У пункта `story_retell` поля `story_id` (какой рассказ предложить) и `review`.
- **/result.** Необязательные `level`, `trials`, `material_id`; в ответе `next_level`, `ability`, `memory_reviewed`.
- **Whisper.** Модель по умолчанию `small` (точнее для русского), `ES_WHISPER_MODEL=base` быстрее. Прогрев сохранён.

## Что изменилось в v0.2 (по сверке с UX-SPEC, разделы 11, 14, 15)

Совместимо назад, кроме пунктов, помеченных «ломает».
- **Р9 картинки.** Две сцены для описания (`bus-stop-rain`, `backyard-wind`), описание в `PICTURES.md`. `picture_id` в `/audio` и `/transcript`, в ответе `picture_units_found`, `picture_units_total` (+ `picture_units_count`, `picture_units_frac`). Новый `GET /pictures`.
- **Р3 статусы.** `GET /patients/{id}/program/today?session_id=` добавляет каждому пункту `status` (`done`, `available`, `waiting`), `done_at`, `part`, `available_at`; на верхнем уровне `next_exercise_id`, `active_days_last_7`. Новый `GET /sessions/{sid}`.
- **Р4.** `delayed_available_at` в ответе `story_retell` (обе фазы), хранится на сервере, есть в `GET /sessions/{sid}` и в пункте программы (`available_at`).
- **Р5 телеметрия.** Поле `meta`, новые типы `hint_offered`, `hint_used`, `story_replayed`, `story_text_shown`, `mic_error`, `stop_reason`. У `mic_error` и `stop_reason` обязателен `meta.reason`.
- **Р6 тексты (ломает форматирование).** «недель» полностью с правильным склонением, десятичная запятая, подписи доменов с заглавной (`label_ru`, «Доступ к слову»). Рядом с каждым текстом коды и числа: `trend_flag.code` и `message_params`, `rationale_params`, `summary_code` и `summary_params`, `explanation_code` и `explanation_params`.
- **Р7 согласие.** У пациента `consent_share`, `consent_version`, `consent_at`. При `consent_share: false` `GET /trajectory` отвечает 403 `share_not_allowed`. У демо-пациентов `consent_share: true`.
- **Р10.** `category` у `naming_fluency` (в MVP только `animals`, по умолчанию `animals`).
- **Р11, Р13.** `/health`: `transcriber_ready`, `transcriber_engine`. Таймаут распознавания 60 секунд (`ES_TRANSCRIBE_TIMEOUT`), при сбое и таймауте 503 `transcription_failed`.
- **Р12.** `GET /demo/numbers`.
- **Р15.** `playable` в `/exercises`, `?only=` в `/program/today` (список id или `playable`). Механика двух неречевых упражнений описана в разделе «Неречевые упражнения MVP» ниже.
- **Демо.** `demo-trend`: `label` «Сауле, 68 лет».
- **Пороги** вынесены в один файл `es/backend/es_core/config.py` (пересмотреть после калибровки).
- **Правки по сверке с frontend.** В `/audio` явно описаны поля формы `picture_id` и `category`. Без `?session_id=` все пункты программы `available` (описано). `/demo/numbers` отдаёт ориентиры ADReSS 2020 (`test_n` 48, `baseline` 0,75) при `accuracy: null`. Новая причина `idle_timeout` для `stop_reason`.
- **Правки по проверке verifier (V-03, V-04, V-13, V-14).**
  - Цель программы по умолчанию: самая низкая функция, которая **не повреждена** (балл не ниже `damaged_threshold` 25); повреждённые идут в `avoid_domains`. «Просевшая» (`reduced`, ниже 45) и «повреждённая» (`damaged`, ниже 25) различаются. У `demo-bypass-b` без `?target` теперь цель `episodic_memory`, программа с `only=playable` из двух неречевых упражнений, как в D4. В профиле у доменов добавлено `damaged`, на верхнем уровне `damaged_threshold`. Программа добирается до бюджета дозы из доступных упражнений.
  - `/audio` и `/transcript`: нет слов в записи даёт 422 `empty_audio`, слишком короткая речь (меньше 3 слов у описания картинки и пересказа) даёт 422 `speech_too_short` (`details.min_words`). Упражнение не засчитывается, ничего не сохраняется, в профиль не попадает. `naming_fluency` с 1-2 словами это обычный результат.
  - 503 `transcription_failed`: `details` теперь объект `{"reason": "<код>"}` (`timeout`, `model_unavailable`, `decode_failed`, `provider_error`, `no_api_key`, `failed`), без путей и текстов сервера. Подробности только в логе сервера.
  - `explanation` в `/demo/bypass-scenario` целиком русский, источник нагрузки только кодом в `load_source` и подписью в `load_label`.
- **Важно для P1.** «Занимались N дней» берётся из `active_days_last_7` в `/program/today`, а не из `/trajectory`, потому что траектория закрыта флагом `consent_share`.


Базовый адрес локально: `http://127.0.0.1:8000`. Формат: JSON, кодировка UTF-8, даты `YYYY-MM-DD`, время ISO 8601 (UTC). CORS открыт для `http://localhost:3000`.
Аккаунтов и ролей нет: пациент это запись с `id`. Кто знает `id`, тот видит данные (для MVP), кроме траектории: её отдаём только при `consent_share: true`.
Живая документация со схемами запросов: `http://127.0.0.1:8000/docs` (Swagger, генерируется кодом). Если контракт и код расходятся, правда в коде, и надо сказать backend.

## Договорённости

- **Язык.** Интерфейс русский. Тексты, которые API возвращает для показа (`message`, `summary`, `rationale`, `explanation`, `label_ru`, `title`), русские: «недель» полностью, десятичная запятая («0,80»), подписи доменов с заглавной. К каждому тексту прилагаются коды и числа (`*_code`, `*_params`), чтобы frontend собрал фразу из своего словаря. Показывать тексты API стоит только в демо и на экране врача. Язык речи (`en` или `ru`) выбирается перед упражнением и передаётся в каждом запросе с речью. Допустимы только `en` и `ru`.
- **Формулировки.** Тексты API не делают клинических выводов (формулировки согласованы в плане, раздел «Этика»). Профиль это «профиль функций относительно ориентиров», флаг близкого это «динамика». Баллы показывать пациенту не нужно (экран пациента без оценок), профиль и динамика предназначены для экранов профиля и близкого.
- **Статус калибровки.** Профиль и пороги пока без калибровки (`calibration: "before_adress_calibration"`). Показывайте подпись `note` рядом с профилем.
- **Нагрузка упражнений** пока предварительная (`load_source: "placeholder, not TRIBE v2"`). Называйте её «предсказанная нагрузка по типу задания», не «нейронная разметка» и не «показания мозга». Показывайте источник, когда выводите нагрузку.
- **Домены** (ключи): `episodic_memory`, `word_access`, `phrase_building`, `attention`, `processing_speed`. Подписи: эпизодическая память, доступ к слову, построение фраз, внимание, скорость обработки (в ответах есть `label_ru`).
- **Оценки** `score` от 0 до 100, `null`, если по домену нет данных. `reduced: true`, если балл ниже порога 45 (функция относительно ориентира снижена, это внутренний признак подбора, не вывод).
- **Аудио.** Сырое аудио не хранится: файл удаляется сразу после распознавания, в базе только признаки. Транскрипт возвращается в ответе, но не сохраняется (если сервер не запущен с `ES_STORE_TRANSCRIPTS=1`, поле `transcript_stored` это показывает).
- **Идентификаторы:** пациент `pt_xxxxxxxxxx`, сессия `ss_xxxxxxxxxx`. Демо: `demo-trend`, `demo-bypass-a`, `demo-bypass-b`.

## Ошибки

Единая форма для всех кодов 4xx и 5xx:

```json
{"error": {"code": "patient_not_found", "message": "Пациент не найден", "details": null}}
```

`details` может отсутствовать. Для `validation_error` это список `[{"field": "body.language", "problem": "..."}]`.

| HTTP | code | когда |
|---|---|---|
| 403 | `consent_required` | у пациента нет согласия на запись голоса |
| 403 | `share_not_allowed` | `GET /trajectory`: нет разрешения показывать динамику близкому (`consent_share: false`) |
| 404 | `patient_not_found`, `session_not_found`, `exercise_not_found`, `story_not_found`, `picture_not_found`, `demo_missing` | нет такой сущности |
| 409 | `no_profile_yet` | нет данных для профиля или программы; `immediate_missing`: отложенный пересказ без пересказа сразу в той же сессии |
| 413 | `audio_too_large` | аудио больше 25 МБ |
| 422 | `validation_error`, `empty_audio`, `speech_too_short`, `exercise_not_speech_measure`, `retell_params_required`, `story_language_mismatch`, `invalid_target`, `invalid_only`, `unsupported_category` | неверные данные |
| 503 | `transcription_failed` | распознавание недоступно (нет модели локально, нет сети для Groq, файл не читается) |

## Эндпоинты

Всего 22: `GET /health`, `GET /exercises`, `GET /stories`, `GET /pictures`, `POST /patients`, `GET /patients/{id}`, `PATCH /patients/{id}`, `DELETE /patients/{id}`, `POST /patients/{id}/sessions`, `POST /sessions/{sid}/exercises/{ex}/audio`, `POST /sessions/{sid}/exercises/{ex}/transcript`, `POST /sessions/{sid}/exercises/{ex}/result`, `POST /sessions/{sid}/telemetry`, `POST /sessions/{sid}/complete`, `GET /sessions/{sid}`, `GET /patients/{id}/profile`, `GET /patients/{id}/program/today`, `GET /patients/{id}/trajectory`, `GET /demo/patients`, `GET /demo/bypass-scenario`, `GET /demo/numbers`, `POST /demo/reset`.

### GET /health

Ответ 200:
```json
{"status": "ok", "load_source": "placeholder, not TRIBE v2", "load_is_placeholder": true,
 "load_label": "Предварительная нагрузка по типу задания, не результат TRIBE v2",
 "languages": ["en", "ru"], "transcriber": "local", "transcriber_ready": true,
 "transcriber_engine": "faster-whisper", "transcriber_state": "ready", "transcriber_model": "small",
 "transcriber_error": null}
```
`transcriber_ready`: `true` только после прогрева: при старте сервер в фоне загружает модель и один раз декодирует короткую запись, пока `transcriber_state` равен `warming` (дальше `ready`, при сбое `error` с текстом в `transcriber_error`, до начала прогрева `cold`). `/health` отвечает сразу, не дожидаясь прогрева. Локально работает без сети. Для Groq: задан ключ (доступность сети не проверяется). Если `false`, первая запись может ждать скачивания модели и упасть по таймауту 60 секунд.

### GET /exercises

Библиотека (25 упражнений) с предсказанной нагрузкой. `channel`: `speech`, `reading`, `visual`, `spatial`, `auditory`, `auditory_visual`, `auditory_motor`, `motor`. `playable: true` у пяти упражнений, для которых во frontend есть экран: `picture_description`, `naming_fluency`, `story_retell`, `spatial_sequence_recall`, `delayed_picture_recognition`. Упражнения с `measures: true` (`picture_description`, `naming_fluency`, `story_retell`) измеряют речь и принимают аудио. Остальные работают без анализа речи, фронтенд сам ведёт игровую часть и шлёт `/result` и `/telemetry`.

Ответ 200 (сокращён):
```json
{"matrix": {"source": "placeholder, not TRIBE v2", "is_placeholder": true, "model_version": null, "atlas": null,
            "domains": ["episodic_memory", "word_access", "phrase_building", "attention", "processing_speed"],
            "domain_notes": {"processing_speed": "proxy of stimulus tempo, not a brain-based value"}},
 "exercises": [{"id": "story_retell", "kind": "story_retell", "channel": "speech", "title": "Пересказ рассказа",
                "duration_min": 4, "measures": true, "speech_output": true, "playable": true, "dose": 9.2,
                "predicted_load": {"episodic_memory": 0.9, "word_access": 0.4, "phrase_building": 0.6,
                                   "attention": 0.3, "processing_speed": 0.1}}]}
```

### GET /stories?language=ru

Рассказы для упражнения «пересказ» (текст читается или проигрывается пациенту). Параметр `language` необязателен (`en`, `ru`).

Ответ 200:
```json
{"stories": [{"id": "apple-tree-ru", "language": "ru", "title": "Яблоня Мираса",
              "text": "Старый садовник Мирас жил на краю села. ...", "units_total": 24}]}
```
Идентификаторы: `apple-tree-ru`, `lantern-keeper-en`. Смысловые единицы клиенту не отдаются.

### POST /patients

Запрос:
```json
{"language": "ru", "label": "Мама", "consent_voice": true, "consent_share": true, "consent_version": "2026-11-v1"}
```
`language` (язык по умолчанию, `en` или `ru`), `label` необязателен. `consent_voice` (запись голоса) и `consent_share` (можно показывать динамику близкому) по умолчанию `false`. `consent_version` версия показанного текста согласия. `consent_at` ставит сервер, когда хотя бы одно согласие дано или изменено.

Ответ 201:
```json
{"id": "pt_3f9a1c07be", "label": "Мама", "language": "ru", "consent_voice": true, "consent_share": true,
 "consent_version": "2026-11-v1", "consent_at": "2026-11-14T15:20:11+00:00", "is_demo": false,
 "created_at": "2026-11-14T15:20:11+00:00"}
```
Ошибка 422: `{"error": {"code": "validation_error", "message": "Некорректные данные запроса", "details": [{"field": "body.language", "problem": "Input should be 'en' or 'ru'"}]}}`

### GET /patients/{id}

Ответ 200: тот же объект, что у POST. Ошибка 404: `{"error": {"code": "patient_not_found", "message": "Пациент не найден"}}`

### PATCH /patients/{id}

Запрос: любое из `consent_voice`, `consent_share`, `consent_version`, например `{"consent_voice": false}` (отзыв). `consent_at` обновляется при изменении. Ответ 200: объект пациента. После отзыва записи загрузка речи отвечает 403 `consent_required`, после отзыва `consent_share` траектория отвечает 403 `share_not_allowed`.

### DELETE /patients/{id}

Удаляет пациента и все его данные (сессии, признаки, телеметрию, сложность). Необратимо. Работает и для демо-пациентов (вернуть: `POST /demo/reset`).

Ответ 200:
```json
{"deleted": true, "patient_id": "pt_3f9a1c07be",
 "removed": {"sessions": 12, "exercise_results": 31, "telemetry_events": 240}}
```
Ошибка 404: `patient_not_found`.

### POST /patients/{id}/sessions

Начало сессии. Тело необязательно. `day` (дата) нужен только для демо и тестов, по умолчанию сегодня.

Запрос: `{}` или `{"day": "2026-11-14"}`
Ответ 201:
```json
{"session_id": "ss_91b2c4d0aa", "patient_id": "pt_3f9a1c07be", "day": "2026-11-14",
 "started_at": "2026-11-14T15:21:00+00:00"}
```
Ошибка 404: `patient_not_found`.

### POST /sessions/{sid}/exercises/{exercise_id}/audio

Загрузка записи упражнения. `multipart/form-data`:
- `file`: аудио из MediaRecorder (webm/opus, также wav, mp3, m4a). До 25 МБ.
- `language`: `en` или `ru` (обязательно).
- `phase`: `immediate` или `delayed`, только для `story_retell`.
- `story_id`: только для `story_retell`.
- `picture_id`: (поле формы, необязательно) только для `picture_description` (`bus-stop-rain`, `backyard-wind`, см. `PICTURES.md`). Включает сопоставление описания со смысловыми единицами картинки.
- `category`: только для `naming_fluency`, в MVP единственное значение `animals` (по умолчанию).

`exercise_id` один из `picture_description`, `naming_fluency`, `story_retell`.

Пример (curl):
```
curl -F file=@rec.webm -F language=ru http://127.0.0.1:8000/sessions/ss_91b2c4d0aa/exercises/picture_description/audio
```

Ответ 200 для `picture_description` (слова сокращены):
```json
{"session_id": "ss_91b2c4d0aa", "exercise_id": "picture_description", "phase": "single", "language": "ru",
 "engine": "faster-whisper:base",
 "transcript": {"text": "Женщина стоит у раковины ...", "language": "ru", "duration": 14.2, "engine": "faster-whisper:base",
                "words": [{"text": "Женщина", "start": 1.2, "end": 1.68}, {"text": "стоит", "start": 1.7, "end": 2.0}]},
 "features": {"word_count": 28, "first_word_latency": 1.2, "pause_ratio": 0.18, "pause_count": 3,
              "pause_before_content_mean": 0.31, "speech_rate_wpm": 148.2, "articulation_rate_wpm": 171.0,
              "mattr": 0.81, "pronoun_share": 0.1, "mean_utterance_len": 14.0, "subordination_per100": 3.6,
              "disfluency_per100": 3.6, "filler_count": 0, "repetition_count": 1, "self_correction_count": 0},
 "session_features": {"pause_ratio": 0.18, "...": "признаки сессии целиком, плоский словарь чисел"},
 "transcript_stored": false}
```
Для живого экрана «паузы, задержки, метрики в реальном времени» используйте `transcript.words` (интервалы между словами это паузы) и `features`.

`features` для `naming_fluency`:
```json
{"fluency_count": 13, "fluency_segments": [5, 4, 3, 1], "fluency_late_early_ratio": 0.2, "fluency_repeats": 1,
 "fluency_off_category": 0, "fluency_switches": 5, "fluency_mean_cluster_size": 2.6,
 "fluency_first_item_latency": 2.0, "fluency_items": ["собака", "кошка", "лошадь"]}
```
`fluency_segments`: число новых верных названий в каждом 15-секундном отрезке (всего 4). В ответе на верхнем уровне также `"category": "animals"`.

Если для `picture_description` передан `picture_id`, в `features` добавляются (и в `session_features`, кроме списка):
```json
{"picture_id": "bus-stop-rain", "picture_units_found": ["p01", "p02", "p03"], "picture_units_total": 14,
 "picture_units_count": 3, "picture_units_frac": 0.214}
```
Неизвестный `picture_id` даёт 404 `picture_not_found`.

`features` для `story_retell`, `phase=immediate`: `{"retell_immediate_frac": 0.54, "retell_units_found": ["u01", "u03"], "retell_units_total": 24}`. В ответе на верхнем уровне для обеих фаз `"delayed_available_at": "2026-11-14T15:41:00+00:00"` (UTC): время пересказа сразу плюс 20 минут (`ES_DELAY_MINUTES` позволяет сократить для показа). Сервер хранит это время. Отложенная часть до этого времени не блокируется, но в программе имеет статус `waiting`.
`phase=delayed` (после пересказа сразу в той же сессии, обычно через 20 минут):
```json
{"retell_immediate_frac": 0.54, "retell_delayed_frac": 0.17, "retell_units_lost": ["u02", "u05"],
 "retell_units_lost_count": 9, "retell_units_new_in_delayed": [], "retell_retention": 0.31,
 "retell_units_found_delayed": ["u01", "u04", "u08", "u11"], "retell_delay_min": 20.4}
```

Ошибки:
- 403 `consent_required`: `{"error": {"code": "consent_required", "message": "Нужно согласие на запись голоса"}}`
- 422 `empty_audio` (в записи нет слов: тишина), `speech_too_short` (меньше 3 слов, кроме `naming_fluency`), `exercise_not_speech_measure` (с `details.speech_exercises`), `retell_params_required`, `story_language_mismatch`
- 409 `immediate_missing`: отложенный пересказ без пересказа сразу
- 503 `transcription_failed`: `{"error": {"code": "transcription_failed", "message": "Не удалось распознать речь", "details": {"reason": "timeout"}}}`. Бывает при таймауте распознавания (60 секунд), недоступной модели или нечитаемом файле. Фронтенд предлагает повторить запись.
- 404 `picture_not_found`, 422 `validation_error` (например, `category` не `animals`)

Повторная загрузка того же упражнения (и фазы) в сессии заменяет прежний результат.

### POST /sessions/{sid}/exercises/{exercise_id}/transcript

То же, что `/audio`, но клиент присылает готовый транскрипт с таймингами слов. Нужно для демо без модели и для тестов. Ответ и ошибки как у `/audio`.

Запрос:
```json
{"language": "ru", "duration": 14.2,
 "words": [{"text": "женщина", "start": 1.2, "end": 1.68}, {"text": "стоит", "start": 1.7, "end": 2.0}],
 "phase": null, "story_id": null, "picture_id": null, "category": "animals"}
```

### POST /sessions/{sid}/exercises/{exercise_id}/result

Итог упражнения (для любого упражнения из `/exercises`). Результат попадает в оценку способности пациента по основному домену упражнения (IRT) и, если передан `material_id`, в модель забывания.

Запрос: `{"accuracy": 0.9, "duration_s": 128, "level": 3, "trials": 5, "material_id": "pictures-kitchen"}`
- `accuracy` 0..1 (обязательно).
- `level` 1..5 необязательно: какой уровень сложности играли (поле `difficulty` пункта программы). Если не передан, сервер берёт уровень, который сам предложил бы сейчас.
- `trials` необязательно: на скольких попытках основана точность (по умолчанию 6). Чем больше, тем сильнее результат влияет на оценку.
- `material_id` необязательно: если повторялся один и тот же материал (набор картинок `pictures-...`, последовательность `seq-...`), модель забывания учтёт проверку припоминания.

Ответ 200:
```json
{"exercise_id": "spatial_sequence_recall", "difficulty_domain": "episodic_memory",
 "difficulty_before": 2, "difficulty_after": 3, "target_accuracy": [0.7, 0.8],
 "next_level": {"level": 3, "predicted_success": 0.74, "source": "irt"},
 "ability": {"theta_before": -0.31, "theta_after": -0.12, "theta_sd": 0.58, "results": 6},
 "memory_reviewed": false}
```
`difficulty_before` это сыгранный уровень, `difficulty_after` уровень, который сервер предложит следующим (то же, что `next_level.level`). `source`: `irt` (3 результата и больше в домене) или `rule` (правило 70-80%: выше 80% на 1 выше, ниже 70% на 1 ниже). Ошибки: 422 `validation_error` (`accuracy` вне 0..1, `level` вне 1..5), 404 `exercise_not_found`.

### POST /sessions/{sid}/telemetry

Пакет событий (можно слать несколько раз за сессию). `type`:
- `first_action`: в `t` время до первого действия, секунды.
- `pause`: `value` длина паузы.
- `hint`: подсказка взята (старое имя, считается так же, как `hint_used`).
- `hint_used`: подсказка взята. `hint_offered`: подсказка предложена, но не взята.
- `interrupt`: прерывание.
- `answer`: `value` задержка ответа в секундах.
- `story_replayed`: рассказ прослушан повторно. `story_text_shown`: показан текст рассказа (меняет условия пересказа).
- `mic_error`: ошибка микрофона, обязателен `meta.reason` из `denied`, `not_found`, `busy`.
- `stop_reason`: причина остановки, обязателен `meta.reason` из `user` (человек остановил сам), `timeout` (вышло время упражнения), `interrupted` (прервано: вкладка скрыта, выход), `idle_timeout` (простой без действий, например 20 секунд в `delayed_picture_recognition`).

`t` секунды от начала упражнения. `exercise_id` необязателен. `meta`: необязательный объект до 10 ключей со значениями строка, число или булево. До 500 событий в пакете.

Запрос:
```json
{"events": [{"type": "first_action", "t": 2.5, "exercise_id": "delayed_picture_recognition"},
            {"type": "hint", "t": 10.0}, {"type": "pause", "t": 12.0, "value": 3.1},
            {"type": "answer", "t": 20.0, "value": 1.2}, {"type": "interrupt", "t": 50.0},
            {"type": "stop_reason", "t": 60.0, "meta": {"reason": "timeout"}}]}
```
Ответ 201:
```json
{"accepted": 6, "session_features": {"time_to_first_action_s": 2.5, "hints_per_session": 1.0,
                                     "hints_offered_count": 0.0, "story_replayed_count": 0.0,
                                     "story_text_shown_count": 0.0, "mic_error_count": 0.0,
                                     "interruptions_per_session": 1.0, "telemetry_pause_count": 1.0}}
```
`rt_cv` (разброс задержек) появляется, когда ответов не меньше трёх.
Ошибка 422 `validation_error`: пустой список, неизвестный `type`, `stop_reason` или `mic_error` без `meta.reason` или с неверной причиной. Ошибка 404: `session_not_found`.
События `stop_reason`, `mic_error`, `hint_offered` и т.п. пока только накапливаются как счётчики, в профиль не входят.

### GET /sessions/{sid}

Состояние сессии: какие упражнения выполнены и когда, время открытия отложенного пересказа. Нужно для восстановления экрана после перезагрузки страницы.

Ответ 200:
```json
{"session_id": "ss_91b2c4d0aa", "patient_id": "pt_3f9a1c07be", "day": "2026-11-14",
 "started_at": "2026-11-14T15:21:00+00:00", "completed_at": null,
 "exercises": [{"exercise_id": "story_retell", "phase": "immediate", "story_id": "apple-tree-ru",
                "done_at": "2026-11-14T15:21:40+00:00"},
               {"exercise_id": "delayed_picture_recognition", "phase": "result", "story_id": null,
                "done_at": "2026-11-14T15:30:02+00:00"}],
 "retell": {"story_id": "apple-tree-ru", "immediate_done_at": "2026-11-14T15:21:40+00:00",
            "delayed_available_at": "2026-11-14T15:41:40+00:00", "delayed_done_at": null},
 "telemetry_events": 12, "session_features": {"retell_immediate_frac": 0.54}}
```
`phase`: `single` (речевое упражнение без фаз), `immediate`, `delayed`, `result` (итог неречевого упражнения через `/result`). `retell` равен `null`, пока нет пересказа сразу. Ошибка 404: `session_not_found`.

### POST /sessions/{sid}/complete

Закрывает сессию (повторный вызов безопасен) и возвращает профиль.

Ответ 200:
```json
{"session_id": "ss_91b2c4d0aa", "completed": true, "session_features": {"...": 0},
 "profile": {"...": "см. GET /patients/{id}/profile"}}
```

### GET /patients/{id}/profile

Профиль функций по сессиям за последние 14 дней (медиана признаков). В расчёт идут только сессии, где есть хотя бы одно упражнение с результатом (речевое через `/audio` или `/transcript`, неречевое через `/result`). Одна телеметрия (`mic_error`, `first_action`, подсказки и т.д.) баллов не даёт: пока данных нет, `has_data: false`, у доменов `score: null`, а `/program/today` и `/trajectory` ведут себя как для пациента без истории (`409 no_profile_yet` у программы, `has_data: false` у траектории).

Ответ 200 (сокращён):
```json
{"patient_id": "demo-bypass-b",
 "domains": {
   "episodic_memory": {"label_ru": "эпизодическая память", "score": 29.9, "coverage": 1.0, "reduced": true,
     "contributions": [{"feature": "retell_retention", "value": 0.5432, "normalised": 0.286, "weight": 0.45}]},
   "word_access": {"label_ru": "доступ к слову", "score": 12.2, "coverage": 1.0, "reduced": true, "contributions": []},
   "phrase_building": {"label_ru": "построение фраз", "score": 17.1, "coverage": 1.0, "reduced": true, "contributions": []},
   "attention": {"label_ru": "внимание", "score": 70.9, "coverage": 1.0, "reduced": false, "contributions": []},
   "processing_speed": {"label_ru": "скорость обработки", "score": 82.3, "coverage": 1.0, "reduced": false, "contributions": []}},
 "reduced_threshold": 45.0, "calibration": "before_adress_calibration",
 "note": "Предварительная оценка, до калибровки на ADReSS. Это профиль функций относительно ориентиров, а не заключение.",
 "has_data": true, "sessions_used": 14, "window_days": 14, "as_of": "2026-11-14",
 "features": {"pause_ratio": 0.2, "...": 0}}
```
`coverage`: какая доля признаков домена есть (0..1). Если данных нет, `has_data: false`, у доменов `score: null`. `contributions` для строки «почему такой балл» (признак, значение, нормированное 0..1, вес). Для лепестковой диаграммы берите `domains.*.score`.
Ошибка 404: `patient_not_found`.

### GET /patients/{id}/program/today

Программа на сегодня. Цель по умолчанию это самая низкая функция, которая не повреждена (балл не ниже 25); подмените параметром `target` (например `target=episodic_memory`). Повреждённые функции (балл ниже 25, кроме цели) избегаются. Если повреждены все, целью становится самая низкая. Параметры:
- `budget` (число, по умолчанию 18): бюджет дозы за сессию.
- `session_id`: если передан, каждый пункт получает статус для этой сессии. Неизвестный, удалённый или чужой `session_id` игнорируется (например, в браузере остался старый id после сброса демо): ответ 200 как без `session_id`, все пункты `available`, в ответе `session_ignored: true` и `session_id: null`. Для валидной сессии `session_ignored: false`.
- `only`: ограничить подбор списком `exercise_id` через запятую или значением `playable` (только упражнения с экраном, см. `/exercises`). Неизвестный id даёт 422 `invalid_only`. Бюджет и сложность считаются уже внутри этого списка.

Поля статуса пункта (всегда есть). Без `session_id` сервер не знает сессию, поэтому у всех пунктов `status: "available"`, `done_at: null`, `part: null`, `available_at: null` (в том числе у `story_retell`: первая или вторая часть определяется только при `session_id`), `next_exercise_id` это первый пункт списка. Frontend может опираться на это поведение:
- `status`: `done` (выполнено), `available` (можно делать сейчас), `waiting` (ждёт времени, сейчас только вторая часть пересказа).
- `done_at`: время выполнения или `null`.
- `part`: для `story_retell` `immediate` (первая часть) или `delayed` (вторая часть), для остальных `null`.
- `available_at`: для `story_retell` в статусе `waiting` или после первой части время открытия второй части (UTC), иначе `null`.
Пример для пересказа: первая часть не сделана: `available`, `part: immediate`; сделана, прошло меньше 20 минут: `waiting`, `part: delayed`; время вышло: `available`, `part: delayed`; сделана вторая часть: `done`.
Дополнительно в ответе:
- `ability`: по каждому домену `{"theta": -0.3, "theta_sd": 0.6, "results": 12, "level": 3, "predicted_success": 0.75, "source": "irt"}`. `theta` способность в логитах (0 средняя для синтетической популяции калибровки), `theta_sd` неопределённость.
- `reviews`: что пора повторить. Элемент: `{"material_id": "story:apple-tree-ru", "kind": "story", "title": "Яблоня Мираса", "predicted_recall": 0.42, "half_life_days": 3.0, "next_review_at": "2026-11-15T09:00:00+00:00", "due": true, "last_review_at": "...", "reviews": 3, "reason_code": "recall_below_target", "reason_params": {"predicted_recall": 0.42, "target_recall": 0.8, "half_life_days": 3.0}, "reason": "«Яблоня Мираса»: ожидаемое припоминание 0,42, ниже 0,80. Пора повторить."}`. `kind`: `story`, `pictures`, `sequence`, `other`. `due: true` когда предсказанное припоминание упало до 0,8 и ниже; `reason_code` тогда `recall_below_target`, иначе `scheduled`. Сначала идут просроченные. Рассказы появляются сами после пересказа, другие материалы после `/result` с `material_id`.
- У пункта `story_retell`: `story_id` (просроченный рассказ, иначе первый рассказ на языке пациента) и `review` (элемент `reviews` или `null`).
Верхний уровень: `next_exercise_id` (первый пункт со статусом `available` или `null`), `active_days_last_7` (сколько дней из последних 7 была хотя бы одна сессия, для строки «занимались N дней»; доступно независимо от `consent_share`), `session_id`.

Ответ 200 (`/patients/demo-bypass-b/program/today?target=episodic_memory`, сокращён):
```json
{"patient_id": "demo-bypass-b", "profile_scores": {"episodic_memory": 29.9, "word_access": 12.2},
 "target_domain": "episodic_memory", "target_label": "Эпизодическая память",
 "avoid_domains": ["word_access", "phrase_building"], "avoid_labels": ["Доступ к слову", "Построение фраз"],
 "session_id": null, "next_exercise_id": "spatial_sequence_recall", "active_days_last_7": 7,
 "lambda": 1.5, "dose_budget": 18.0, "dose_total": 15.3,
 "items": [{"exercise_id": "spatial_sequence_recall", "kind": "memory_spatial", "channel": "spatial",
            "title": "Повторить последовательность на поле", "duration_min": 3, "speech_output": false,
            "difficulty": 2, "difficulty_domain": "episodic_memory", "predicted_success": 0.74,
            "difficulty_source": "irt", "score": 0.8, "dose": 5.1,
            "status": "available", "done_at": null, "part": null, "available_at": null,
            "predicted_load": {"episodic_memory": 0.8, "word_access": 0.0, "phrase_building": 0.0,
                               "attention": 0.5, "processing_speed": 0.2},
            "rationale": "Нагрузка на «Эпизодическая память»: 0,80, на сниженные функции: «Доступ к слову» 0,00, «Построение фраз» 0,00",
            "rationale_params": {"target_domain": "episodic_memory", "target_load": 0.8,
                                 "avoid_loads": {"word_access": 0.0, "phrase_building": 0.0}}}],
 "naive_item_ids": ["story_retell", "word_list_recall_spoken", "..."], "differs_from_naive": true,
 "load_source": "placeholder, not TRIBE v2",
 "summary_code": "bypass", "summary_params": {"target_domain": "episodic_memory", "avoid_domains": ["word_access", "phrase_building"]},
 "summary": "Цель на сегодня: «Эпизодическая память». Задания с большой нагрузкой на «Доступ к слову», «Построение фраз» сегодня обходим: тренируем цель через сохранные каналы."}
```
`difficulty` от 1 до 5 (по основному домену задания), `predicted_success` предсказанная вероятность успеха на этом уровне, `difficulty_source` откуда уровень: `irt` или `rule` (меньше 3 результатов в домене). `naive_item_ids` это что выбрал бы подбор без учёта сниженных функций (для показа «что изменил обходной путь»).
`summary_code`: `bypass` (есть обходимые функции) или `direct`. Для пациента без истории (409 `no_profile_yet`) frontend сам показывает три речевых упражнения по умолчанию.
Ошибки: 409 `no_profile_yet` (`{"error": {"code": "no_profile_yet", "message": "Пока нет данных для профиля: пройдите хотя бы одну сессию"}}`), 422 `invalid_target`, 422 `invalid_only`, 404 `patient_not_found`.

### GET /patients/{id}/trajectory

Траектория по неделям (до 26) и флаг тренда для экрана близкого. Неделя это 7 дней, считая назад от последней сессии.

Ответ 200 (`/patients/demo-trend/trajectory`, сокращён):
```json
{"patient_id": "demo-trend", "has_data": true,
 "weeks": [{"week": 1, "start": "2026-08-23", "end": "2026-08-29", "sessions": 7,
            "scores": {"episodic_memory": 87.8, "word_access": 75.6, "phrase_building": 77.1,
                       "attention": 84.5, "processing_speed": 82.1},
            "metrics": {"pause_before_content_mean": 0.41, "fluency_count": 18.0, "retell_retention": 0.859,
                        "speech_rate_wpm": 132.3, "time_to_first_action_s": 2.19}}],
 "series": {"word_access": [75.6, 73.5, 70.2, 65.6, 64.8, 60.7, 58.8, 57.7, 52.6, 52.5, 47.9, 45.8],
            "episodic_memory": [87.8, 88.4, 88.2, 84.9, 87.3, 88.3, 85.8, 86.9, 87.3, 84.6, 83.2, 86.5]},
 "trend_flag": {"active": true, "level": "watch", "code": "trend_watch",
                "message_params": {"weeks": 12, "domains": ["word_access"]},
                "domains": ["word_access"], "domain_labels": ["Доступ к слову"],
                "message": "За 12 недель динамика по «Доступ к слову» идёт заметно ниже ориентира. Это наблюдение за трендом, не вывод о состоянии. Обсудите со специалистом.",
                "reference_slope_per_week": -0.1,
                "per_domain": {"word_access": {"weeks": 12, "slope_per_week": -2.69, "delta": -24.4, "flag": true}}},
 "labels_ru": {"word_access": "Доступ к слову"}}
```
`series` (все пять доменов) для линий графика, `null` в неделе без сессий. `metrics` микрометрики недели (главное на экране профиля, не балл). Флаг включается, когда есть не менее 6 недель, наклон не более -1 балл в неделю и падение последних 3 недель относительно первых 3 не менее 8 баллов. Пороги предварительные. Если флага нет: `active: false`, `level: "none"`, `code: "trend_none"`, `message: "Заметного отклонения динамики от ориентира не видно."`
Ошибки: 404 `patient_not_found`; 403 `share_not_allowed` (`{"error": {"code": "share_not_allowed", "message": "Разрешение показывать динамику близкому не дано"}}`), если у пациента `consent_share: false`. Без данных: `has_data: false`, `weeks: []`.

### GET /demo/patients

Ответ 200:
```json
{"patients": [{"id": "demo-bypass-a", "label": "Демо: дефицит памяти, речь сохранна", "language": "ru",
               "consent_voice": true, "consent_share": true, "consent_version": "demo", "consent_at": "...", "is_demo": true, "created_at": "...", "sessions": 14,
               "profile_scores": {"episodic_memory": 29.9, "word_access": 75.4, "phrase_building": 77.1,
                                  "attention": 82.3, "processing_speed": 82.3}},
              {"id": "demo-bypass-b", "...": "..."}, {"id": "demo-trend", "label": "Сауле, 68 лет", "...": "..."}]}
```
Данные пересоздаются при каждом запуске сервера (даты считаются назад от сегодняшнего дня), seed фиксирован, значения воспроизводимы.

### GET /demo/bypass-scenario

Главный кадр демо: два пациента с одинаково сниженной эпизодической памятью, но разной речью. Цель фиксирована: `episodic_memory`.

Ответ 200 (сокращён):
```json
{"target_domain": "episodic_memory", "same_memory_score": true, "programs_differ": true,
 "patients": [{"patient_id": "demo-bypass-a", "label": "Демо: дефицит памяти, речь сохранна",
               "profile_scores": {"episodic_memory": 29.9, "word_access": 75.4},
               "program": {"avoid_domains": [], "items": [{"exercise_id": "story_retell", "speech_output": true}]}},
              {"patient_id": "demo-bypass-b", "label": "Демо: дефицит памяти, речь снижена",
               "profile_scores": {"episodic_memory": 29.9, "word_access": 12.2},
               "program": {"avoid_domains": ["word_access", "phrase_building"],
                           "items": [{"exercise_id": "spatial_sequence_recall", "speech_output": false}]}}],
 "speech_exercises_a": ["story_retell"], "speech_exercises_b": [],
 "load_source": "placeholder, not TRIBE v2",
 "explanation_code": "bypass_demo", "load_label": "Предварительная нагрузка по типу задания, не результат TRIBE v2",
 "explanation_params": {"target_domain": "episodic_memory", "same_memory_score": true,
                        "avoid_domains_b": ["word_access", "phrase_building"], "load_source": "placeholder, not TRIBE v2"},
 "explanation": "У обоих одинаково снижена эпизодическая память. У второго снижены ещё и речевые функции, поэтому система тренирует память через зрительные и пространственные задания, а речевые обходит. Нагрузка пока предварительная: placeholder, not TRIBE v2."}
```
У каждого `program` полная структура как в `/program/today`. Ошибка 404 `demo_missing`, если демо-пациентов удалили (`POST /demo/reset`).

### GET /demo/numbers

Числа для экрана жюри (D6). Сейчас оба блока `pending`.

Ответ 200:
```json
{"load_source": "placeholder, not TRIBE v2", "load_is_placeholder": true,
 "adress": {"status": "pending", "accuracy": null, "test_n": 48, "baseline": 0.75,
            "baseline_source": "ADReSS 2020 test set (Luz et al.), linguistic features baseline"},
 "agreement": {"status": "pending", "value": null, "method": null}}
```
`baseline` и `test_n` это опубликованные ориентиры ADReSS 2020 (английская речь, описание картинки Cookie Theft, тест 48 человек, точность базовой модели на лингвистических признаках 0,75), не результат Siriva. `accuracy` остаётся `null`, пока нет собственного классификатора. Когда `ES_LOAD_MATRIX` указывает на настоящую матрицу (не `placeholder, not TRIBE v2`), `agreement` считается как корреляция Спирмена по упражнениям, по каждому домену, настоящая матрица против заглушки:
```json
{"agreement": {"status": "ready", "value": 0.42,
               "method": "Spearman rank correlation across exercises, per domain, real matrix vs placeholder; value is the mean over domains except processing_speed (proxy)",
               "per_domain": {"episodic_memory": 0.5, "word_access": 0.6, "phrase_building": 0.3,
                              "attention": 0.3, "processing_speed": 0.2},
               "exercises_compared": 25, "source": "TRIBE v2 predicted load", "model_version": "...", "atlas": "..."}}
```
`value` это среднее по четырём доменам без `processing_speed` (скорость обработки в обеих матрицах только прокси темпа), `per_domain` показывает все пять. Блок `adress` останется `pending`, пока нет данных ADReSS.

### GET /pictures

Сцены для описания картинки. Сами изображения лежат во frontend (`es/web/public/pictures/<image_file>`), см. `PICTURES.md`.

Ответ 200 (сокращён):
```json
{"pictures": [{"id": "bus-stop-rain", "title": "Остановка в дождь", "title_en": "Bus stop in the rain",
               "image_file": "bus-stop-rain.png", "units_total": 14,
               "units": [{"id": "p01", "kind": "person", "label": "женщина", "label_en": "woman"}]}]}
```
`units` нужны только панели жюри (какие единицы найдены); пациенту их не показывают.

### POST /demo/reset

Пересоздаёт трёх демо-пациентов (у всех `consent_voice` и `consent_share` true) (удаляет их изменения). Тело не нужно. Ответ 200: `{"reset": true, "patients": ["demo-trend", "demo-bypass-a", "demo-bypass-b"]}`

## Неречевые упражнения MVP (playable)

Выбраны два упражнения, которые чаще всего попадают в программу `demo-bypass-b` при цели «Эпизодическая память» (у него речевые домены снижены, поэтому речевые задания обходятся). Проверено перебором бюджета 8-24 и числа пунктов 3-6: `spatial_sequence_recall` и `delayed_picture_recognition` в 15 программах из 15, следующий `picture_pair_memory` в 9. Во всех остальных неречевых упражнениях экрана в MVP нет, они помечены `playable: false`. Для обоих: общий каркас, без таймера давления, крупные кнопки, без слов «ошибка» и «неверно» (мягкая обратная связь), результат уходит в `/result`, события в `/telemetry`.

Общие правила `/result` для этих двух: `accuracy` от 0 до 1 считается по правилам ниже, `duration_s` это время от начала упражнения до конца. Сервер по `accuracy` меняет сложность (70-80% держит, выше 80% на 1 выше, ниже 70% на 1 ниже). Уровень сложности 1-5 приходит в `difficulty` пункта программы.

### spatial_sequence_recall: «Повторить последовательность на поле»

Что видит человек: поле 3 на 3 больших плитки. Подсветка показывает последовательность: каждая плитка загорается на 0,8 с, пауза 0,4 с. После показа надпись «Теперь вы» и человек нажимает те же плитки в том же порядке. Кнопка «Показать ещё раз» (один раз на попытку). Затем следующая попытка.

Параметры:
- Попыток за упражнение: 5.
- Длина последовательности = 2 + `difficulty` (уровень 1: 3 плитки, уровень 5: 7 плиток). Одна и та же плитка подряд не повторяется.
- Если человек не нажимает 15 секунд, попытка засчитывается как не пройденная и идёт следующая.

Точность: `accuracy` = число попыток, в которых вся последовательность повторена верно, делённое на 5 (шаг 0,2). Повторный показ не штрафуется (он считается подсказкой в телеметрии).

Что приходит в `/result`: `{"accuracy": 0.8, "duration_s": 96}`.

Телеметрия (`exercise_id: "spatial_sequence_recall"`):
- `first_action`: `t` от конца первого показа до первого нажатия (секунды).
- `answer` на каждую попытку: `value` секунды от конца показа до последнего нажатия (или 15, если время вышло).
- `hint`: нажата «Показать ещё раз» (при этом можно слать `hint_used`, но достаточно одного из двух).
- `pause`: пауза между нажатиями дольше 3 секунд, `value` длина.
- `interrupt`, `stop_reason`, как в остальных упражнениях.

### delayed_picture_recognition: «Узнать картинки, показанные раньше»

Что видит человек: сначала по одной показываются картинки («Запомните картинку»), по 4 секунды каждая. Затем спокойный экран «Небольшой перерыв» на 30 секунд (кнопки нет, обратный отсчёт не показывается). Потом картинки идут по одной вперемешку: те, что были, и новые. Вопрос «Эта картинка была?» и две большие кнопки «Была» и «Не было». Ответ принимается без подтверждения, следующая картинка появляется через 1 секунду. Подсказки нет, повторного показа нет.

Параметры по `difficulty`: число запоминаемых картинок N = 3 + `difficulty` (уровень 1: 4, уровень 5: 8). В проверке 2N картинок: N показанных и N новых, порядок случайный, но не больше трёх одинаковых ответов подряд. Картинки: простые предметы быта в одном стиле, без текста, не связанные по смыслу между собой (чашка, ключ, яблоко, стул, ботинок, зонт, лампа, часы, книга, расчёска, ложка, мяч, ножницы, ведро, свеча, велосипед), пул не меньше 16.

Точность: `accuracy` = число верных ответов («Была» на показанную и «Не было» на новую), делённое на 2N. Случайное угадывание даёт около 0,5, поэтому целевой коридор 70-80% по-прежнему работает.

Что приходит в `/result`: `{"accuracy": 0.75, "duration_s": 118}`.

Телеметрия (`exercise_id: "delayed_picture_recognition"`):
- `first_action`: `t` от появления первой картинки проверки до первого ответа.
- `answer` на каждую картинку проверки: `value` секунды от появления картинки до нажатия кнопки.
- `pause`: бездействие дольше 5 секунд на одной картинке, `value` длина.
- `interrupt`, `stop_reason`. Если 20 секунд без ответа: картинка засчитывается как неверный ответ, шлётся `stop_reason` с `meta.reason: "idle_timeout"`, упражнение идёт дальше.

## Типичный путь экрана

1. `POST /patients` (после экрана согласия) -> `id`.
2. `POST /patients/{id}/sessions` -> `session_id`.
3. Для каждого упражнения: показать задание, слать `/telemetry` пакетами, для речевого `/audio`, для игрового `/result`. Список для сегодня: `GET /patients/{id}/program/today?session_id=...&only=playable`, статусы пунктов обновляются после каждого шага.
4. `POST /sessions/{sid}/complete` -> профиль.
5. Экран пациента `GET /program/today`, профиль `GET /profile`, близкий `GET /trajectory`.
6. Кнопка «удалить мои данные» -> `DELETE /patients/{id}`.

## Подключение матрицы TRIBE v2

Переключение одной переменной окружения сервера `ES_LOAD_MATRIX=<путь к файлу>`. Тогда `load_source` во всех ответах (`/health`, `/exercises` в `matrix.source`, `/program/today`, `/demo/bypass-scenario`, `/demo/numbers`) становится `source` из файла, `load_is_placeholder` равно `false`, `load_label` берётся из `label_ru` файла, текст `explanation` в сценарии обходного пути перестаёт говорить «предварительная», а `/demo/numbers.agreement` получает статус `ready`. Форматы и поля ответов не меняются, frontend правок не требует: подписывайте нагрузку по `load_label` и `load_is_placeholder`.

### Гибридная матрица

`ES_LOAD_MATRIX=es/tribe/out/load_matrix.hybrid.json` (создаёт `es/backend/scripts/build_hybrid_matrix.py`): `word_access`, `phrase_building`, `attention` из TRIBE v2 (проверено), `episodic_memory` и `processing_speed` из оценки по типу задания. `/exercises` в `matrix`: `is_hybrid: true`, `domain_sources` (по домену `tribe_v2` или `task_type_estimate`). `load_source` и `load_label` русские. `/demo/numbers.agreement`: `value` среднее только по доменам TRIBE (`domains_in_mean`), `per_domain` показывает все пять, у каждого `domain_sources`, `note` объясняет, что остальные домены совпадают с оценкой по построению (их значение 1,0 в среднее не входит).

## Что пока заглушка

- Нагрузка упражнений: `placeholder, not TRIBE v2` (поле `load_source`).
- `GET /demo/numbers`: оба блока `pending` до данных ADReSS и настоящей матрицы.
- Баллы доменов: эвристика без калибровки (`calibration`).
- Классификатор на ADReSS не подключён (нет данных, будет только для английской речи; для русской остаются временные метрики и профиль).
- Распознавание речи Whisper отбрасывает «э-э» и сглаживает паузы, поэтому заполнители по аудио недосчитываются (по транскрипту с таймингами `/transcript` они считаются).
