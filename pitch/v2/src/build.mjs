import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = '..';
const ES = path.join(ROOT, 'es');
const PITCH = path.join(ES, 'pitch');
export const OUT = path.join(PITCH, 'v2');
const C = {white:'#FFFFFF',ink:'#1E2320',muted:'#454C47',blue:'#2F5D7C',teal:'#1C5A51',deep:'#12332E',mint:'#DCEAE5',light:'#F3F6F8',line:'#DCE3E8',on:'#E3EFEA',pale:'#A9D3C6',purple:'#45376A',ochre:'#5F410A'};
const FONT = 'Arial';
const manifest = [];

function text(slide, value, x, y, w, h, size=26, color=C.ink, bold=false, extra={}) {
  const shape=slide.shapes.add({geometry:'textbox',name:value.slice(0,65),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  shape.text=value;
  shape.text.style={fontFamily:FONT,fontSize:size,color,bold,alignment:'left',verticalAlignment:'top',wrap:true,autoFit:'none',insets:0,...extra};
  return shape;
}
async function image(slide, source, x,y,w,h,alt,fit='contain',crop) {
  const bytes=await fs.readFile(source);
  return slide.images.add({blob:new Uint8Array(bytes),contentType:'image/png',alt,position:{left:x,top:y,width:w,height:h},fit,...(crop?{crop}: {})});
}
function slide(p,title,{dark=false,note='',source='',timing=''}={}) {
  const s=p.slides.add();
  s.background.fill=dark?C.deep:C.white;
  const index=p.slides.items.length;
  text(s,'Siriva',64,31,210,30,22,dark?C.pale:C.teal,true);
  text(s,String(index).padStart(2,'0')+' / 12',1113,34,104,26,19,dark?C.pale:C.muted,false,{alignment:'right'});
  if(title) text(s,title,64,99,1148,114,48,dark?C.white:C.ink,true);
  s.speakerNotes.text=`${timing}\n\n${note}\n\nИсточники: ${source}`;
  manifest.push({number:index,title,note,source,timing});
  return s;
}
function footer(s,value,{dark=false}={}){text(s,value,64,663,1144,33,19,dark?C.pale:C.muted);}
function table(s,values,x,y,width,height,colWidths,size=24){
  const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width,height,values,columnWidths:colWidths});
  t.borders.assign({style:'solid',fill:C.line,width:1});
  t.cells.block({row:0,column:0,rowCount:values.length,columnCount:values[0].length}).assign({fill:C.white,textStyle:{fontFamily:FONT,fontSize:size,color:C.ink},margins:{left:16,right:16,top:17,bottom:12},anchor:'center'});
  t.cells.block({row:0,column:0,rowCount:1,columnCount:values[0].length}).assign({fill:C.light,textStyle:{fontFamily:FONT,fontSize:size,bold:true,color:C.blue}});
  return t;
}

export async function build(p) {
  manifest.length=0;
  if(p.slides.items.length) p.slides.delete(p.slides.items.map(s=>s.id));
  // The palette and sans-serif type follow DESIGN-MEDTECH.md, section 12.
  // The figures below are source assets, not newly drawn illustrations.

  let s=slide(p,'',{dark:true,timing:'0:00-0:15',note:'Siriva помогает человеку с ранними когнитивными трудностями заниматься дома. Короткие упражнения дают материал для оценки речи и поведения. По этим наблюдениям система подбирает следующие задания. Сегодня показываем исследовательский прототип.',source:'es/README.md; es/docs/DESIGN-MEDTECH.md, раздел 12. Декоративный объект: es/design/assets/es-3d-memory-transparent.png, ранее сгенерирован для проекта.'});
  text(s,'Siriva',64,122,690,125,112,C.white,true);
  text(s,'Ежедневные упражнения\nдля речи и памяти',69,286,740,132,49,C.white,true);
  text(s,'Профиль пяти функций и задания,\nкоторые подстраиваются под человека',69,458,710,85,29,C.pale);
  await image(s,path.join(ES,'design/assets/es-3d-memory-transparent.png'),855,145,338,450,'Декоративный объект: пять мягких слоёв');
  footer(s,'Исследовательский прототип. Ноябрь 2026',{dark:true});

  s=slide(p,'Один балл скрывает разные усилия',{timing:'0:15-0:35',note:'Представим два прохождения одного упражнения. В обоих человек ответил правильно восемь раз из десяти. Но во второй раз он в три раза дольше ждал перед ответом и чаще просил подсказку. Если смотреть только на итог, эта разница исчезнет. Siriva сохраняет такие изменения между занятиями. Это условный пример, а не данные исследования.',source:'es-mvp-plan.md, разделы «Проблема» и «Слой 1»; числа на слайде иллюстративные.'});
  text(s,'8 из 10',64,248,600,125,110,C.blue,true);
  text(s,'Правильных ответов столько же',70,392,630,42,29,C.muted);
  table(s,[['Перед ответом','Раньше','Сейчас'],['Ожидание','1 секунда','3 секунды'],['Подсказки','Не нужны','Нужны']],720,246,488,254,[230,129,129],23);
  text(s,'Меняются паузы, темп и число подсказок',70,541,1080,63,35,C.teal,true);
  footer(s,'Условный пример. Цифры не описывают реального пациента');

  s=slide(p,'Короткое занятие в браузере',{timing:'0:35-0:50',note:'Человек открывает занятие в браузере. Интерфейс ведёт его по одному заданию за раз, не показывает баллы и позволяет увеличить шрифт. Речь можно записывать на русском или английском. Отдельное согласие управляет доступом близкого к динамике.',source:'es/README.md; es/docs/UX-SPEC.md; скриншот es/pitch/assets/screens/site.png.'});
  text(s,'Один понятный\nшаг на экране',64,246,336,94,36,C.blue,true);
  text(s,'Крупный текст\n\nРусская и английская речь\n\nОтдельное согласие\nна доступ близкого',64,376,330,217,25,C.muted);
  await image(s,path.join(PITCH,'assets/screens/site.png'),431,215,790,421,'Реальный экран лендинга Siriva с примерами интерфейса');
  footer(s,'Экран работающего прототипа');

  s=slide(p,'Упражнение одновременно измеряет',{timing:'0:50-1:10',note:'В описании картинки наблюдаем задержку до первого слова, паузы и найденные смысловые единицы. В назывании животных смотрим, как меняется темп в течение минуты и повторяет ли человек слова. В пересказе сравниваем, сколько смысловых единиц сохранилось сразу и через двадцать минут. При распознавании аудио обрабатывается локально и затем удаляется.',source:'es/docs/API-CONTRACT.md; es/backend/es_core/features.py; es/backend/es_core/fluency.py; es/backend/es_core/retell.py.'});
  table(s,[['Задание','Что наблюдаем'],['Описание картинки','Паузы, задержка до первого слова,\nсмысловые единицы'],['Животные за минуту','Число слов, повторы,\nтемп по 15-секундным отрезкам'],['Пересказ рассказа','Сохранение смысловых единиц\nсразу и через 20 минут']],64,234,1144,339,[400,744],25);
  text(s,'Whisper работает локально. Аудио удаляется после распознавания',65,609,1142,38,24,C.teal,true);

  s=slide(p,'Профиль показывает, что меняется',{timing:'1:10-1:30',note:'Система собирает профиль по пяти функциям: эпизодическая память, доступ к слову, построение фраз, внимание и скорость обработки. Здесь Сауле, 68 лет, синтетическая история за двенадцать недель. Баллы профиля пока рассчитаны по прозрачным эвристикам, калибровки на пациентах не было. Смысл демонстрации в том, чтобы связать наблюдаемые речевые признаки с выбором задания.',source:'es/backend/es_core/profile.py; es/backend/es_core/synthetic.py; es/docs/API-CONTRACT.md; скриншот es/pitch/assets/screens-src/d3-profile.png.'});
  text(s,'5 функций',64,248,345,85,65,C.blue,true);
  text(s,'Память\nПодбор слов\nПостроение фраз\nВнимание\nСкорость обработки',68,365,310,221,26,C.ink);
  await image(s,path.join(PITCH,'assets/screens-src/d3-profile.png'),406,221,810,416,'Экран профиля пяти функций и истории Сауле, синтетические данные');
  footer(s,'Синтетический пациент. 12 недель. Профиль до клинической калибровки');

  s=slide(p,'Память можно тренировать через зрение',{timing:'1:30-1:55',note:'Главный сценарий продукта: у двух синтетических пациентов одинаково снижена память, но разное состояние речи. Когда речь сохранна, программа включает пересказ. Когда речь снижена, выбираем задания с картинками и пространством. Система ищет нагрузку на целевую функцию и ограничивает нагрузку на трудную функцию. Это проверка поведения алгоритма, а не доказанная эффективность реабилитации.',source:'es/backend/es_core/planner.py; es/backend/es_core/matrix.py; es/docs/API-CONTRACT.md, /demo/bypass; es/pitch/assets/screens-src/d4-bypass.png.'});
  table(s,[['','Пациент А','Пациент Б'],['Память','Снижена','Снижена'],['Речь','Сохранна','Снижена'],['Программа','Пересказ рассказа\nУзнавание картинок','Зрительные задания\nПространственные задания']],64,232,1144,308,[220,462,462],26);
  text(s,'Подбор учитывает сохранные функции',68,579,1100,52,36,C.teal,true);
  footer(s,'Синтетические пациенты. Демонстрация алгоритма подбора');

  s=slide(p,'TRIBE v2 помогает оценивать нагрузку',{dark:true,timing:'1:55-2:20',note:'Для библиотеки из двадцати пяти упражнений мы подготовили английские стимулы и посчитали их звук и текст через TRIBE v2. Модель предсказывает реакцию на воспринимаемый стимул. В продукте используется гибрид: подбор слов, построение фраз и внимание берём из TRIBE, память и скорость оцениваем по типу задания. Видеовход в итог не вошёл. Это предсказание модели, не измерение мозга пациента. Лицензия CC BY-NC 4.0 допускает только некоммерческий прототип.',source:'es/tribe/REPORT-v2.md; es/tribe/out/load_matrix.hybrid.json; es/backend/scripts/build_hybrid_matrix.py.'});
  text(s,'25',64,240,375,122,112,C.white,true);
  text(s,'упражнений в библиотеке',69,379,390,72,29,C.pale);
  text(s,'Английские стимулы\nЗвук и текст',69,489,380,93,30,C.on);
  text(s,'TRIBE v2',561,246,610,60,44,C.white,true);
  text(s,'Подбор слов\nПостроение фраз\nВнимание',565,334,600,124,31,C.on);
  text(s,'Оценка по типу задания',563,494,610,44,29,C.pale,true);
  text(s,'Память и скорость обработки',565,550,640,39,27,C.on);
  footer(s,'В итоговой матрице нет видео. CC BY-NC 4.0, некоммерческий прототип',{dark:true});

  s=slide(p,'Лучшее согласие - в речевых функциях',{timing:'2:20-2:45',note:'Сравнили предсказанную нагрузку со своей предварительной оценкой по типу задания. На двадцати пяти упражнениях Спирмен для подбора слов 0,88, для построения фраз 0,68, для внимания 0,03. Это ещё не независимая экспертная оценка. Высокое согласие в речевых функциях частично отражает наличие речи в стимуле. Внимание почти не согласуется с разметкой внутри библиотеки, хотя группы речевых и неречевых заданий различаются. Среднее 0,53 не следует называть точностью.',source:'es/tribe/REPORT-v2.md, «Валидация матрицы звук+текст», n=25; es/tribe/mac/work/v2_val_audio_text.md. Подбор слов p<0,001, фразы p<0,001, внимание p=0,883.'});
  const chart=s.charts.add('bar',{position:{left:58,top:254,width:770,height:338},title:'Корреляция Спирмена',titlePlacement:'aboveChart',titleTextStyle:{typeface:FONT,fontSize:24,fill:C.muted},categories:['Подбор слов','Построение фраз','Внимание'],series:[{name:'ρ Спирмена',values:[0.88,0.68,0.03],fill:C.blue,points:[{idx:2,fill:C.line}]}],barOptions:{direction:'bar',grouping:'clustered',gapWidth:90},hasLegend:false,xAxis:{visible:true,textStyle:{typeface:FONT,fontSize:22,fill:C.ink},line:{fill:'none',width:0},majorGridlines:null},yAxis:{visible:false,min:0,max:1,majorGridlines:null},dataLabels:{showValue:true,position:'outEnd',numberFormatCode:'0.00',textStyle:{typeface:FONT,fontSize:28,fill:C.blue,bold:true}},chartFill:C.white,plotAreaFill:C.white,chartLine:{fill:'none',width:0}});
  ['0,88','0,68','0,03'].forEach((value,index)=>{const label=chart.series.getItemAt(0).dataLabelOverrides.add(index);label.text=value;label.position='outEnd';label.textStyle.fontSize=28;label.textStyle.fill=C.blue;});
  text(s,'С чем сравнивали',866,292,337,48,27,C.teal,true);
  text(s,'Наша оценка нагрузки\nпо типу задания.\n\nНезависимой разметки\nспециалистов ещё нет.',867,357,337,186,25,C.muted);
  footer(s,'Данные команды, n = 25 упражнений. Согласие разметок не доказывает клинический эффект');

  s=slide(p,'Близкий видит динамику по неделям',{timing:'2:45-3:05',note:'Близкий получает понятную динамику при согласии человека. На этой синтетической истории за двенадцать недель называние меняется примерно с восемнадцати до тринадцати слов в минуту. Изменение отражается в речевых признаках и в профиле. Интерфейс предлагает обсудить динамику со специалистом. Уведомление не является медицинским заключением.',source:'es/backend/es_core/synthetic.py, HEALTHY.fluency_count=18 и WORD_ACCESS_END.fluency_count=13, до шума и недельного агрегирования; es/pitch/assets/screens-src/d5-family.png; es/docs/API-CONTRACT.md, /trajectory.'});
  text(s,'12 недель',64,243,370,83,62,C.blue,true);
  text(s,'18 раньше\n13 сейчас',65,345,345,106,43,C.teal,true);
  text(s,'слов за минуту\nв синтетическом сценарии',69,465,314,85,25,C.muted);
  text(s,'Доступ по согласию',68,564,336,39,25,C.ink,true);
  await image(s,path.join(PITCH,'assets/screens-src/d5-family.png'),422,217,794,418,'Экран близкого: недельная динамика синтетического пациента');
  footer(s,'Синтетические данные. Исходные значения генератора, с шумом и недельным усреднением');

  s=slide(p,'В прототипе уже можно пройти занятие',{timing:'3:05-3:25',note:'В работающем прототипе пять упражнений: три с голосом и два без речи. Есть локальное распознавание, профиль, программа и экран близкого. Модель Раша подбирает сложность, модель забывания планирует повторы. Параметры этих моделей проверялись на синтетических данных и требуют калибровки. На этом месте можно перейти к живой записи на demo. Если запись не работает, в приложении есть заранее записанный пример.',source:'es/README.md; es/docs/API-CONTRACT.md; es/backend/es_core/irt.py; es/backend/es_core/forgetting.py; es/pitch/assets/screens-src/d2-live.png.'});
  text(s,'5 упражнений',64,242,384,70,51,C.blue,true);
  text(s,'3 с голосом\n2 без речи',68,335,333,99,33,C.ink,true);
  text(s,'Подбор сложности\nПланирование повторов\nУдаление данных',68,488,338,122,25,C.muted);
  await image(s,path.join(PITCH,'assets/screens-src/d2-live.png'),440,214,775,420,'Живая запись речи и извлечение признаков в Siriva');
  footer(s,'Демонстрация: /demo. Параметры сложности и повторов до калибровки на людях');

  s=slide(p,'Следующий этап - пилот с клиникой',{timing:'3:25-3:45',note:'Предлагаем исследовательский пилот на двадцати-тридцати участниках. Сначала доступ к данным и независимая разметка упражнений специалистами. Затем исследование удобства и повторяемости речевых метрик. После этого можно калибровать профиль и оценивать клинические исходы в отдельном протоколе. Доступа к ADReSS и результата собственной модели на нём пока нет. Для коммерческого продукта понадобится отдельное решение по лицензии TRIBE v2.',source:'es-mvp-plan.md, «После MVP»; es/docs/DEMENTIABANK-REQUEST.md; es/tribe/REPORT-v2.md; es/README.md. Размер пилота 20-30 - план, не набранная группа.'});
  text(s,'20-30',64,243,510,122,105,C.blue,true);
  text(s,'участников в планируемом пилоте',69,382,590,63,29,C.muted);
  text(s,'Независимая разметка упражнений\n\nПроверка удобства и повторяемости\n\nКалибровка профиля на реальных данных',68,471,870,151,27,C.ink);
  await image(s,path.join(ES,'design/assets/es-3d-trajectory-transparent.png'),922,256,280,240,'Декоративная метафора траектории');
  footer(s,'На людях продукт не проверялся. Собственный результат на ADReSS пока не получен');

  s=slide(p,'',{dark:true,timing:'3:45-4:00',note:'Мы ищем научного руководителя для доступа к речевым данным и клинику, с которой можно подготовить пилот. Следующая цель команды - проверить прототип на реальных данных и расширять языковую поддержку вместе со специалистами. Спасибо.',source:'es-mvp-plan.md; es/pitch/README.md; es/pitch/src/build.py, TEAM. Декоративный объект es/design/assets/es-3d-links-transparent.png.'});
  text(s,'Нам нужен\nклинический партнёр',64,142,1000,151,63,C.white,true);
  text(s,'Научный руководитель для доступа к данным\nКлиника для подготовки пилота',69,350,1045,96,30,C.on);
  text(s,'Shadil Nurmukhammed',69,518,700,37,28,C.white,true);
  text(s,'Amangeldiev Kaisar',69,563,700,37,28,C.white,true);
  await image(s,path.join(ES,'design/assets/es-3d-links-transparent.png'),928,478,283,139,'Декоративная метафора связей');
  footer(s,'Siriva. Ежедневные упражнения для речи и памяти',{dark:true});

  await fs.mkdir(OUT,{recursive:true});
  await fs.writeFile(path.join(OUT,'src/content.json'),JSON.stringify(manifest,null,2));
  const speech='# Siriva: общий спич, около 4 минут\n\nГоворит один или несколько участников команды, роли не распределены.\n\n'+manifest.map(a=>`## ${String(a.number).padStart(2,'0')} ${a.title||'Siriva'} (${a.timing})\n\n${a.note}\n\nИсточники: ${a.source}\n`).join('\n');
  await fs.writeFile(path.join(OUT,'SPEECH.md'),speech);
  return {slides:p.slides.items.length,titles:manifest.map(x=>x.title||'Siriva')};
}
