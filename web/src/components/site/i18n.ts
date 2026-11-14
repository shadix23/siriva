// Словарь лендинга Siriva (ru и en). Только для src/components/site/*.

import type { BrainText } from "./BrainViewer";
import type { BrainPlayerText } from "./BrainPlayer";

export type Lang = "ru" | "en";

export const LANG_KEY = "siriva-site-lang";

type Fact = { figure: string; text: string; source: string; href: string };
type Step = { title: string; text: string };
type Who = { title: string; text: string; link: string; href: string };
type Point = { title: string; text: string };
export type Channel = "speech" | "visual" | "spatial";
type BypassPatient = { name: string; chip: string; weak: boolean; items: { title: string; channel: Channel }[] };
type Bypass = {
  title: string;
  channels: Record<Channel, string>;
  patients: [BypassPatient, BypassPatient];
  note: string;
};

export type Dict = {
  meta: { skip: string; langLabel: string; menu: string };
  nav: { how: string; science: string; family: string; demo: string; start: string };
  hero: {
    title: string;
    sub: string;
    primary: string;
    secondary: string;
    note: string;
    altPhone: string;
    altBrowser: string;
  };
  problem: { title: string; facts: Fact[]; caveat: string };
  live: { title: string; lead: string; lead2: string; player: BrainPlayerText };
  how: { title: string; lead: string; steps: Step[]; alt: string };
  who: { title: string; items: Who[]; altFamily: string };
  science: {
    title: string;
    body: string;
    honest: string;
    tableTitle: string;
    rows: { label: string; value: string }[];
    tableNote: string;
    link: string;
    alt: string;
    brain: BrainText;
    bypass: Bypass;
  };
  privacy: { title: string; lead: string; points: Point[] };
  cta: { title: string; sub: string };
  footer: { tagline: string; jury: string; disclaimer: string; synthetic: string; nav: string };
};

const ru: Dict = {
  meta: { skip: "Перейти к содержанию", langLabel: "Язык сайта", menu: "Разделы сайта" },
  nav: { how: "Как работает", science: "Наука", family: "Для близких", demo: "Демо", start: "Начать" },
  hero: {
    title: "Занятия для речи и памяти, которые подстраиваются под человека",
    sub: "7 минут в день. Упражнения тренируют и измеряют речь, а близкий видит динамику.",
    primary: "Начать занятия",
    secondary: "Для близких",
    note: "Работает в браузере, без установки.",
    altPhone: "Экран «Сегодня»: три упражнения, около 7 минут",
    altBrowser: "Профиль пяти функций для близкого: память, подбор слов, фразы, внимание, скорость",
  },
  problem: {
    title: "Ранние сигналы есть в языке. Помощь редко доходит до дома",
    facts: [
      {
        figure: "7,6 года",
        text: "заранее по описанию картинки предсказали, у кого разовьются когнитивные нарушения.",
        source: "Framingham Heart Study, Eyigoz et al., EClinicalMedicine, 2020",
        href: "https://doi.org/10.1016/j.eclinm.2020.100583",
      },
      {
        figure: "475 человек",
        text: "на ранней стадии нарушений: реабилитация по личным целям дала заметный результат.",
        source: "GREAT, Clare et al., Int J Geriatr Psychiatry, 2019",
        href: "https://doi.org/10.1002/gps.5076",
      },
      {
        figure: "1 терапевт",
        text: "приходил к каждому домой. Каждой семье такого не дать.",
        source: "GREAT, Clare et al., Health Technol Assess, 2019",
        href: "https://doi.org/10.3310/hta23100",
      },
    ],
    caveat: "Framingham: одна англоязычная когорта, для русского не проверено.",
  },
  live: {
    title: "Как упражнение нагружает мозг",
    lead: "Выберите упражнение: модель покажет, какие зоны коры откликаются секунда за секундой.",
    lead2: "В речевых заданиях поднимаются языковая сеть и слуховая кора. В задании на поле они остаются ниже среднего.",
    player: {
      group: "Упражнение",
      play: "Воспроизвести",
      pause: "Пауза",
      time: "Время упражнения, секунды",
      sec: "с",
      of: "из",
      low: "ниже среднего",
      high: "выше среднего",
      zones: { language: "Языковая сеть", auditory: "Слуховая кора" },
      levels: ["ниже среднего", "около среднего", "выше среднего"],
      caption: "Предсказание TRIBE v2 (Meta) по звуку и тексту упражнения, модель усреднённого мозга, не измерение человека.",
      loading: "Загружаем модель мозга",
      alt: "Предсказанная активность коры по TRIBE v2",
      drag: "Потяните, чтобы повернуть",
    },
  },
  how: {
    title: "Три шага каждый день",
    lead: "Само занятие и есть измерение.",
    steps: [
      {
        title: "Короткое занятие",
        text: "Пересказ, названия животных, картинка. Около 7 минут.",
      },
      {
        title: "Измерение внутри упражнения",
        text: "Паузы перед словами, темп и память на рассказ.",
      },
      {
        title: "Подстройка программы",
        text: "Если речь даётся труднее, память тренируется через картинки.",
      },
    ],
    alt: "Экран упражнения «Пересказ рассказа» с выбором языка",
  },
  who: {
    title: "Для кого Siriva",
    items: [
      {
        title: "Человеку",
        text: "Одна кнопка, 7 минут, без оценок.",
        link: "Начать занятия",
        href: "/app",
      },
      {
        title: "Близкому",
        text: "Сводка за неделю и что обсудить со специалистом.",
        link: "Открыть сводку",
        href: "/family",
      },
      {
        title: "Специалисту",
        text: "Профиль пяти функций с понятными показателями.",
        link: "Посмотреть профиль",
        href: "/family/profile",
      },
    ],
    altFamily: "Сводка для близкого на телефоне",
  },
  science: {
    title: "Обходной путь: память тренируется через то, что сохранно",
    body: "Нагрузку упражнений на речь и внимание предсказывает TRIBE v2 от Meta. Если подбор слов снижен, Siriva тренирует память в обход речи.",
    honest: "Это предсказанная нагрузка, не измерение мозга человека.",
    tableTitle: "Согласованность TRIBE v2 с оценкой по типу задания",
    rows: [
      { label: "В целом", value: "0,53" },
      { label: "Подбор слов", value: "0,88" },
      { label: "Построение фраз", value: "0,68" },
    ],
    tableNote: "Проверки на людях с нарушениями ещё не было. TRIBE v2 распространяется по лицензии CC BY-NC.",
    link: "Посмотреть подбор в демо",
    alt: "Два пациента с одинаковой памятью и разной речью получают разные программы",
    brain: {
      group: "Упражнение",
      caption: "Предсказание TRIBE v2 (Meta) по звуку и тексту упражнения. Модель усреднённого мозга, не измерение человека.",
      agreement: "Совпадает с нашей оценкой: подбор слов 0,88",
      diff: "Речевые минус зрительные задания",
      low: "средняя",
      high: "выше",
      diffLow: "сильнее в зрительных заданиях",
      diffHigh: "в речевых",
      loading: "Загружаем модель мозга",
      alt: "Предсказанная нагрузка на кору по TRIBE v2",
      unavailable: "Модель мозга недоступна",
      mask: "линия: языковая зона",
    },
    // программы из GET /demo/bypass-scenario (синтетические пациенты, снято 15.11.2026)
    bypass: {
      title: "Одна цель, память на события. Разные программы",
      channels: { speech: "речь", visual: "зрение", spatial: "пространство" },
      patients: [
        {
          name: "Пациент А",
          chip: "речь сохранна",
          weak: false,
          items: [
            { title: "Пересказ рассказа", channel: "speech" },
            { title: "Узнать картинки, показанные раньше", channel: "visual" },
            { title: "Повторить ряд цифр нажатиями", channel: "visual" },
          ],
        },
        {
          name: "Пациент Б",
          chip: "речь снижена",
          weak: true,
          items: [
            { title: "Вспомнить покупки по картинкам", channel: "visual" },
            { title: "Вспомнить маршрут на карте", channel: "spatial" },
            { title: "Повторить последовательность на поле", channel: "spatial" },
          ],
        },
      ],
      note: "Пациенту Б пересказ не даём: он сильно нагружает подбор слов.",
    },
  },
  privacy: {
    title: "Голос остаётся вашим",
    lead: "Речь нужна только для показателей.",
    points: [
      {
        title: "Запись не хранится",
        text: "Остаются только показатели.",
      },
      {
        title: "Обработка на месте",
        text: "Голос не уходит в облако.",
      },
      {
        title: "Удаление в один шаг",
        text: "Всё стирается в настройках.",
      },
    ],
  },
  cta: {
    title: "Первое занятие займёт 7 минут",
    sub: "Начните с короткого рассказа.",
  },
  footer: {
    tagline: "Ежедневные занятия для речи и памяти.",
    jury: "Демо для жюри",
    disclaimer: "Не является медицинским изделием и не ставит диагноз.",
    synthetic: "Экраны на сайте показывают синтетического пациента.",
    nav: "Ссылки в подвале",
  },
};

const en: Dict = {
  meta: { skip: "Skip to content", langLabel: "Site language", menu: "Site sections" },
  nav: { how: "How it works", science: "Science", family: "For families", demo: "Demo", start: "Start" },
  hero: {
    title: "Speech and memory exercises that adapt to the person",
    sub: "7 minutes a day. Exercises train and measure speech, and family can follow the progress.",
    primary: "Start exercises",
    secondary: "For families",
    note: "Runs in the browser, nothing to install.",
    altPhone: "The Today screen: three exercises, about 7 minutes",
    altBrowser: "Five-function profile for a family member: memory, word finding, sentences, attention, speed",
  },
  problem: {
    title: "Language carries early signals. Help rarely reaches the home",
    facts: [
      {
        figure: "7.6 years",
        text: "ahead, a picture description predicted who would develop cognitive impairment.",
        source: "Framingham Heart Study, Eyigoz et al., EClinicalMedicine, 2020",
        href: "https://doi.org/10.1016/j.eclinm.2020.100583",
      },
      {
        figure: "475 people",
        text: "in the early stage of cognitive impairment: goal-oriented rehabilitation clearly helped.",
        source: "GREAT, Clare et al., Int J Geriatr Psychiatry, 2019",
        href: "https://doi.org/10.1002/gps.5076",
      },
      {
        figure: "1 therapist",
        text: "visited each participant at home. Few families can get that.",
        source: "GREAT, Clare et al., Health Technol Assess, 2019",
        href: "https://doi.org/10.3310/hta23100",
      },
    ],
    caveat: "Framingham: one English-speaking cohort, not validated for Russian.",
  },
  live: {
    title: "How an exercise loads the brain",
    lead: "Pick an exercise and the model shows which cortical areas respond, second by second.",
    lead2: "Speech tasks lift the language network and the auditory cortex. In the grid task they stay below average.",
    player: {
      group: "Exercise",
      play: "Play",
      pause: "Pause",
      time: "Exercise time, seconds",
      sec: "s",
      of: "of",
      low: "below average",
      high: "above average",
      zones: { language: "Language network", auditory: "Auditory cortex" },
      levels: ["below average", "around average", "above average"],
      caption: "TRIBE v2 (Meta) prediction from the exercise's sound and text. An average-brain model, not a measurement of a person.",
      loading: "Loading the brain model",
      alt: "Predicted cortical activity from TRIBE v2",
      drag: "Drag to rotate",
    },
  },
  how: {
    title: "Three steps a day",
    lead: "The exercise is the measurement.",
    steps: [
      {
        title: "A short session",
        text: "Retell a story, name animals, describe a picture. About 7 minutes.",
      },
      {
        title: "Measured inside the exercise",
        text: "Pauses before words, speech rate and story recall.",
      },
      {
        title: "The plan adapts",
        text: "If speech gets harder, memory is trained through pictures.",
      },
    ],
    alt: "The Story retelling exercise with a language choice",
  },
  who: {
    title: "Who Siriva is for",
    items: [
      {
        title: "The person",
        text: "One button, 7 minutes, no scores.",
        link: "Start exercises",
        href: "/app",
      },
      {
        title: "Family",
        text: "A weekly summary and what to discuss with a specialist.",
        link: "Open the summary",
        href: "/family",
      },
      {
        title: "Specialists",
        text: "A five-function profile with plain measures.",
        link: "View the profile",
        href: "/family/profile",
      },
    ],
    altFamily: "Family summary on a phone",
  },
  science: {
    title: "The bypass: memory is trained through what still works",
    body: "TRIBE v2 by Meta predicts each exercise's load on speech and attention. If word finding is reduced, Siriva trains memory around speech.",
    honest: "This is a predicted load, not a measurement of the person's brain.",
    tableTitle: "TRIBE v2 agreement with our task-type estimate",
    rows: [
      { label: "Overall", value: "0.53" },
      { label: "Word finding", value: "0.88" },
      { label: "Sentence building", value: "0.68" },
    ],
    tableNote: "Not yet tested with people who have impairments. TRIBE v2 is released under CC BY-NC.",
    link: "See the matching in the demo",
    alt: "Two patients with the same memory and different speech get different plans",
    brain: {
      group: "Exercise",
      caption: "TRIBE v2 (Meta) prediction from the exercise's sound and text. An average-brain model, not a measurement of a person.",
      agreement: "Matches our own labels: word finding 0.88",
      diff: "Speech minus visual tasks",
      low: "average",
      high: "higher",
      diffLow: "stronger in visual tasks",
      diffHigh: "in speech tasks",
      loading: "Loading the brain model",
      alt: "Predicted cortical load from TRIBE v2",
      unavailable: "Brain model unavailable",
      mask: "line: language area",
    },
    bypass: {
      title: "One goal, episodic memory. Different plans",
      channels: { speech: "speech", visual: "vision", spatial: "space" },
      patients: [
        {
          name: "Patient A",
          chip: "speech intact",
          weak: false,
          items: [
            { title: "Retell a story", channel: "speech" },
            { title: "Recognise pictures shown earlier", channel: "visual" },
            { title: "Repeat a digit sequence by tapping", channel: "visual" },
          ],
        },
        {
          name: "Patient B",
          chip: "speech reduced",
          weak: true,
          items: [
            { title: "Recall a shopping list from pictures", channel: "visual" },
            { title: "Recall a route on a map", channel: "spatial" },
            { title: "Repeat a sequence on a grid", channel: "spatial" },
          ],
        },
      ],
      note: "Patient B gets no story retelling: it loads word finding heavily.",
    },
  },
  privacy: {
    title: "Your voice stays yours",
    lead: "Speech is used only for measures.",
    points: [
      {
        title: "Recordings are not kept",
        text: "Only the measures are kept.",
      },
      {
        title: "Processed on site",
        text: "The voice never goes to the cloud.",
      },
      {
        title: "One-step deletion",
        text: "Erase everything in settings.",
      },
    ],
  },
  cta: {
    title: "The first session takes 7 minutes",
    sub: "Start with a short story.",
  },
  footer: {
    tagline: "Daily exercises for speech and memory.",
    jury: "Demo for the jury",
    disclaimer: "Not a medical device and does not provide a diagnosis.",
    synthetic: "Screens on this site show a synthetic patient.",
    nav: "Footer links",
  },
};

export const dict: Record<Lang, Dict> = { ru, en };
