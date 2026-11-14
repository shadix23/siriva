# Картинки для упражнения «Описание картинки»

Файл создаёт `es/backend/scripts/build_pictures_doc.py` из `es_core/pictures.py`. Правки вносить в код, потом перегенерировать.

Две оригинальные сцены, не копии известных тестов (Cookie Theft и др.). В каждой 14-15 смысловых единиц: люди, действия, предметы, настроение сцены и две-три странности (их люди замечают не всегда, это тоже сигнал).

## Что нужно от иллюстрации

- Файлы `bus-stop-rain.png` и `backyard-wind.png`, 1536x1024, положить в `es/web/public/pictures/`.
- Спокойная плоская иллюстрация, высокий контраст, крупные формы, без текста, букв и цифр на картинке. Один стиль для обеих сцен.
- Все единицы из таблиц должны быть видны. Странности (тип `oddity`) должны быть различимы, но не кричащими.
- Генерация: `tools/codex-image.sh` с промптом ниже (промпт на английском, готов к использованию как есть).

## Как используется в API

В запросе `/audio` или `/transcript` для `picture_description` передаётся `picture_id` (необязательно). Если он есть, в ответе появляются `picture_id`, `picture_units_found` (id найденных единиц), `picture_units_total`, `picture_units_count`, `picture_units_frac`. Совпадение по ключевым словам языка речи (`language`), см. таблицы. Список сцен: `GET /pictures` (id, названия, файл, число единиц; список единиц с подписями только для панели жюри).

## bus-stop-rain: Остановка в дождь (Bus stop in the rain)

Файл: `bus-stop-rain.png`

Промпт для генерации (en):

> Calm flat vector illustration, high contrast, clear bold shapes, limited warm palette, uncluttered composition, no text, no letters, no numbers, no signs with writing, no watermark, 1536x1024, landscape. A rainy afternoon at a city bus stop. In the center a woman in a green coat holds a big red umbrella and a shopping bag. A small bird sits on top of the umbrella. On a bench to the left an old man in a grey cap reads a newspaper. On the right a young boy in bright yellow rubber boots jumps into a large puddle, and in the puddle a fish is swimming. A brown dog sits on a leash beside the bench, looking at the boy. A bus with lit windows is arriving from the far right. A tall pole with a round blank sign and a round clock stands at the stop. Rain falls in clear diagonal lines.

| id | тип | единица (ru) | unit (en) | ключевые слова ru | keywords en |
|---|---|---|---|---|---|
| p01 | person | женщина | woman | женщин, девушк, дам$ | woman, lady |
| p02 | object | красный зонт | red umbrella | зонт | umbrella |
| p03 | setting | идёт дождь | it is raining | дожд | rain |
| p04 | person | старик на скамейке | old man on a bench | скамей, лавк | bench |
| p05 | object | газета | newspaper | газет | newspaper, paper$ |
| p06 | person | мальчик | boy | мальчик, ребен, малыш | boy, child, kid$ |
| p07 | object | жёлтые сапоги | yellow boots | сапог, сапож, ботинк | boot |
| p08 | action | прыгает в лужу | jumps in a puddle | луж | puddle |
| p09 | object | собака на поводке | dog on a leash | собак, пес$, пса$, щен | dog, puppy |
| p10 | object | автобус | bus | автобус | bus$, buses |
| p11 | object | столб с часами | pole with a clock | часы$, часов, часами, столб | clock, pole$ |
| p12 | object | сумка с покупками | shopping bag | сумк, пакет, покупк, продукт | bag$, groceries, shopping |
| p13 | oddity | рыба в луже | fish in the puddle | рыб | fish |
| p14 | oddity | птица на зонте | bird on the umbrella | птиц, воробь, голуб | bird, pigeon, sparrow |

Единиц: 14.

## backyard-wind: Двор в ветреный день (Backyard on a windy day)

Файл: `backyard-wind.png`

Промпт для генерации (en):

> Calm flat vector illustration, high contrast, clear bold shapes, limited warm palette, uncluttered composition, no text, no letters, no numbers, no signs with writing, no watermark, 1536x1024, landscape. A sunny but windy backyard of a village house. On the left a woman in a blue dress hangs white sheets on a clothesline, the sheets blowing strongly in the wind. A black cat sits on the clothesline between the sheets. In the middle a boy runs holding a kite string, and the red kite is caught in the branches of an apple tree. A tall wooden ladder stands alone in the middle of the lawn, leaning on nothing. On the right a grandfather in a straw hat waters colorful flowers with a green garden hose. A girl sits on the grass reading a book. In the foreground a small table with a teapot and two cups, and a basket of red apples. A pair of old shoes hangs from a branch of the tree. Clear blue sky, one small bird on the roof.

| id | тип | единица (ru) | unit (en) | ключевые слова ru | keywords en |
|---|---|---|---|---|---|
| p01 | person | женщина | woman | женщин, мам$, мама | woman, mother, mom$, lady |
| p02 | action | вешает бельё | hangs laundry | бель, простын, веревк, вешает, развеш | laundry, sheet, washing, clothesline, clothes |
| p03 | setting | сильный ветер | strong wind | ветер, ветр, ветрен | wind |
| p04 | person | мальчик | boy | мальчик, ребен | boy, child |
| p05 | object | воздушный змей | kite | змей | kite |
| p06 | action | змей застрял на дереве | kite is caught in the tree | дерев, ветк, застр, запута, яблон | tree, stuck, caught, tangled |
| p07 | person | дедушка | grandfather | дед, старик, пожил | grandfather, grandpa, elderly, old+man |
| p08 | action | поливает из шланга | waters with a hose | шланг, полив, поли | hose, water |
| p09 | object | цветы | flowers | цвет, клумб | flower |
| p10 | oddity | кот на верёвке | cat on the clothesline | кот$, кошк, кота$, коте$ | cat$, kitten |
| p11 | person | девочка с книгой | girl with a book | девочк, книг, чита | girl, book, reading, reads |
| p12 | object | стол с чайником | table with a teapot | чайник, стол, чашк, чай$ | teapot, table, cups, tea$ |
| p13 | object | корзина яблок | basket of apples | яблок, корзин | apple, basket |
| p14 | oddity | лестница посреди двора | ladder in the middle of the lawn | лестниц | ladder |
| p15 | oddity | ботинки на ветке | shoes hanging on a branch | ботин, башмак, туфл, обув | shoe, boots |

Единиц: 15.

## Как читать ключевые слова

Слово из описания совпадает с ключом, если начинается с него (основа слова, регистр и «ё» не важны). Ключ со знаком `$` на конце совпадает только со словом целиком. Знак `+` в таблице значит, что нужны оба слова рядом (в пределах 8 слов). Альтернативы разделены запятой: достаточно одной.

Сопоставление простое и намеренно щедрое: оно показывает, что человек назвал, а не оценивает речь. Это один из признаков, в профиль он пока не входит (до калибровки).
