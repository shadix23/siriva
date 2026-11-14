import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT='~/Desktop/ClaudeProject';
const ES=path.join(ROOT,'es');
const P=path.join(ES,'pitch');
export const OUT=path.join(P,'visual');
const C={white:'#FFFFFF',ink:'#1E2320',muted:'#454C47',blue:'#2F5D7C',teal:'#1C5A51',deep:'#12332E',mint:'#DCEAE5',line:'#DCE3E8',pale:'#A9D3C6',on:'#E3EFEA'};
const FONT='Arial';
let records=[];
function tx(s,v,x,y,w,h,size=28,color=C.ink,bold=false,extra={}){
 const q=s.shapes.add({geometry:'textbox',name:v.slice(0,65),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 q.text=v;q.text.style={fontFamily:FONT,fontSize:size,color,bold,alignment:'left',verticalAlignment:'top',wrap:true,autoFit:'none',insets:0,...extra};
 records[records.length-1].visible.push(v);return q;
}
async function pic(s,file,x,y,w,h,alt,crop,fit='contain'){
 const bytes=await fs.readFile(file);
 return s.images.add({blob:new Uint8Array(bytes),contentType:'image/png',alt,fit,position:{left:x,top:y,width:w,height:h},...(crop?{crop}:{})});
}
function add(p,title,note,source,{dark=false,time=''}={}){
 const s=p.slides.add();s.background.fill=dark?C.deep:C.white;
 const i=p.slides.items.length;
 records.push({slide:i,title,note,source,time,visible:[]});
 tx(s,'Siriva',64,31,160,30,22,dark?C.pale:C.teal,true);
 tx(s,String(i).padStart(2,'0')+' / 10',1123,34,91,25,18,dark?C.pale:C.muted,false,{alignment:'right'});
 if(title)tx(s,title,64,105,1150,112,49,dark?C.white:C.ink,true);
 s.speakerNotes.text=`${time}\n\n${note}\n\nИсточники и границы: ${source}`;
 return s;
}
function foot(s,v,dark=false){tx(s,v,64,666,1148,30,18.7,dark?C.pale:C.muted);}
function chartLabels(c,labels){labels.forEach((v,i)=>{const d=c.series.getItemAt(0).dataLabelOverrides.add(i);d.text=v;d.position='outEnd';d.textStyle.fontSize=31;d.textStyle.fill=C.blue;});}

export async function build(p){
 records=[];if(p.slides.items.length)p.slides.delete(p.slides.items.map(x=>x.id));
 const profile=JSON.parse(await fs.readFile(path.join(OUT,'src/profile.json'),'utf8'));
 let s=add(p,'','Siriva помогает людям с ранними когнитивными трудностями заниматься дома. Короткие упражнения одновременно дают материал для наблюдения за речью и поведением. Мы подбираем следующие задания по профилю функций. Сегодня это исследовательский прототип, который мы хотим проверить вместе с клиникой.','es/README.md; es/docs/DESIGN-MEDTECH.md, раздел 12. Иллюстрация saule-tablet.png сгенерирована, персонаж вымышленный.',{time:'0:00-0:20'});
 await pic(s,path.join(OUT,'assets/saule-tablet.png'),500,119,780,520,'Вымышленная пожилая женщина выполняет задание с планшетом');
 tx(s,'Siriva',64,146,650,115,105,C.blue,true);
 tx(s,'Упражнения\nдля речи\nи памяти',68,300,550,212,57,C.ink,true);
 foot(s,'Каждое занятие помогает подобрать следующее');

 s=add(p,'Баллы скрывают усилия','Представим, что сегодня человек снова ответил правильно восемь раз из десяти. Но перед каждым ответом он думает дольше. Итоговый балл этого не показывает. Siriva сохраняет паузы, задержки и обращения к подсказкам, чтобы видеть изменения между занятиями. Числа на этом слайде служат только иллюстрацией идеи.','es-mvp-plan.md, «Проблема». Условный пример. Иллюстрация saule-recall.png сгенерирована, персонаж вымышленный.',{time:'0:20-0:45'});
 await pic(s,path.join(OUT,'assets/saule-recall.png'),552,213,668,446,'Вымышленная женщина задумалась над картинками, рядом часы');
 tx(s,'8 из 10',64,273,493,117,100,C.blue,true);
 tx(s,'Ответ тот же.\nПауза дольше.',69,438,474,110,39,C.teal,true);
 foot(s,'Условный пример');

 s=add(p,'Упражнение становится измерением','Человек описывает картинку, называет животных за минуту или пересказывает рассказ. По записи считаем время до первого слова, долю пауз и смысловые единицы. В пересказе сравниваем результат сразу и через двадцать минут. Whisper обрабатывает речь локально, после распознавания аудио удаляется. В демо можно показать живую запись.','es/docs/API-CONTRACT.md; es/backend/es_core/features.py; es/backend/es_core/retell.py. Иллюстрация задания: es/web/public/pictures/bus-stop-rain.png.',{time:'0:45-1:10'});
 await pic(s,path.join(ES,'web/public/pictures/bus-stop-rain.png'),368,218,842,432,'Оригинальная иллюстрация для упражнения: остановка в дождь');
 tx(s,'Паузы',64,268,238,46,32,C.blue,true);
 tx(s,'Время\nдо ответа',64,383,246,84,32,C.ink,true);
 tx(s,'Смысловые\nединицы',64,514,248,84,32,C.ink,true);
 foot(s,'Распознавание локально. Аудио удаляется после обработки');

 s=add(p,'Профиль пяти функций','На синтетическом пациенте показываем, как может меняться профиль за двенадцать недель. Доступ к слову меняется сильнее остальных функций, что отражает заданный сценарием рост пауз и уменьшение числа названных животных. Пять функций собираются из наблюдаемых речевых и поведенческих признаков. Веса предварительные, клинической калибровки ещё нет.','es/backend/es_core/synthetic.py; es/backend/es_core/profile.py. seed=7, дата 14.11.2026, медианы первых и последних семи дней. Точные числа: src/profile.json.',{time:'1:10-1:35'});
 const keys=['episodic_memory','word_access','phrase_building','attention','processing_speed'];
 s.charts.add('radar',{position:{left:52,top:223,width:758,height:408},title:'Профиль функций',titlePlacement:'none',titleTextStyle:{typeface:FONT,fontSize:22,fill:C.muted},categories:['Память','Подбор слов','Фразы','Внимание','Скорость'],series:[{name:'Неделя 1',values:keys.map(k=>profile.first[k]),fill:'none',line:{fill:'#8595A0',width:2,style:'dashed'},marker:{symbol:'none'}},{name:'Неделя 12',values:keys.map(k=>profile.last[k]),fill:'none',line:{fill:C.blue,width:4},marker:{symbol:'circle',size:6,fill:C.blue}}],radarOptions:{style:'marker'},hasLegend:true,legend:{position:'bottom',textStyle:{typeface:FONT,fontSize:22,fill:C.muted}},xAxis:{visible:true,textStyle:{typeface:FONT,fontSize:24,fill:C.ink},line:{fill:C.line,width:1}},yAxis:{visible:true,min:0,max:100,majorUnit:25,tickLabelPosition:'none',majorGridlines:{fill:C.line,width:1}},chartFill:C.white,plotAreaFill:C.white});
 tx(s,'12',880,281,310,124,114,C.blue,true);
 tx(s,'недель\nнаблюдений',884,435,326,93,36,C.ink,true);
 foot(s,'Синтетические данные. Профиль до клинической калибровки');

 s=add(p,'Обходной путь','Если память снижена и человеку трудно говорить, мы выбираем задания с меньшей нагрузкой на речь. Память при этом остаётся целью, но упражнение опирается на зрение или пространство. В программе есть узнавание картинок и повторение последовательности. Когда речь сохранна, в программу может входить пересказ. Так работает алгоритм на синтетических пациентах. Его клиническую пользу предстоит проверить.','es/backend/es_core/planner.py; es/tribe/out/load_matrix.hybrid.json; es/docs/API-CONTRACT.md, /demo/bypass. Иллюстрация visual-memory.png сгенерирована.',{time:'1:35-2:05'});
 await pic(s,path.join(OUT,'assets/visual-memory.png'),483,209,748,467,'Карточки для зрительной памяти и пространственное поле с последовательностью');
 tx(s,'Речь затруднена',64,254,443,49,31,C.muted);
 tx(s,'Память\nтренируем\nчерез зрение\nи пространство',66,340,490,215,43,C.teal,true);
 foot(s,'Пример подбора для синтетического пациента');

 s=add(p,'Подбор по нагрузке','В библиотеке двадцать пять упражнений. Для них прогнали английские звук и текст через TRIBE v2. Модель предсказывает нагрузку воспринимаемого материала, а не измеряет мозг пациента. В продукте гибрид: подбор слов, фразы и внимание из TRIBE, память и скорость по типу задания. Видеовход в итоговую матрицу не вошёл. Текущий прототип некоммерческий, лицензия TRIBE CC BY-NC 4.0.','es/tribe/REPORT-v2.md; es/tribe/out/load_matrix.hybrid.json. TRIBE v2: английский звук для 25 заданий, текст для 9 речевых. Иллюстрация es/design/assets/es-3d-links-transparent.png.',{dark:true,time:'2:05-2:35'});
 tx(s,'25',65,267,335,126,116,C.white,true);
 tx(s,'упражнений\nв каталоге',70,425,330,96,35,C.on);
 await pic(s,path.join(ES,'design/assets/es-3d-links-transparent.png'),408,270,372,256,'Абстрактная метафора связи материалов с профилем нагрузки');
 tx(s,'TRIBE v2',817,276,393,67,47,C.white,true);
 tx(s,'Звук и текст\nПредсказанная\nнагрузка',821,388,392,132,32,C.on);
 foot(s,'Память и скорость - оценка по типу задания. Только некоммерческий прототип',true);

 s=add(p,'Где модель совпала с оценкой','На двадцати пяти упражнениях сравнили предсказанную нагрузку с собственной предварительной оценкой по типу задания. Корреляция Спирмена 0,88 для подбора слов, 0,68 для фраз и 0,03 для внимания. Высокая связь в речевых функциях частично отражает наличие речи во входе. Независимой разметки специалистов ещё нет. Эти числа не являются точностью распознавания нарушений и не доказывают эффективность реабилитации.','es/tribe/REPORT-v2.md; es/tribe/mac/work/v2_val_audio_text.md. n=25. p<0,001 для слов и фраз, p=0,883 для внимания.',{time:'2:35-3:00'});
 const ch=s.charts.add('bar',{position:{left:63,top:229,width:1150,height:389},title:'Корреляция Спирмена',titlePlacement:'aboveChart',titleTextStyle:{typeface:FONT,fontSize:22,fill:C.muted},categories:['Внимание','Построение фраз','Подбор слов'],series:[{name:'ρ Спирмена',values:[0.03,0.68,0.88],fill:C.blue,points:[{idx:0,fill:C.line}]}],barOptions:{direction:'bar',grouping:'clustered',gapWidth:100},hasLegend:false,xAxis:{visible:true,textStyle:{typeface:FONT,fontSize:27,fill:C.ink},line:{fill:'none',width:0}},yAxis:{visible:false,min:0,max:1,majorGridlines:null},dataLabels:{showValue:true,position:'outEnd',textStyle:{typeface:FONT,fontSize:31,fill:C.blue,bold:true}},chartFill:C.white,plotAreaFill:C.white,chartLine:{fill:'none',width:0}});
 chartLabels(ch,['0,03','0,68','0,88']);
 foot(s,'Оценка команды, 25 упражнений. Независимая проверка впереди');

 s=add(p,'Близкий видит изменения','При согласии человека близкий видит динамику по неделям. В этом синтетическом сценарии число названных животных изменилось с восемнадцати до тринадцати в минуту. Экран показывает конкретную динамику и помогает подготовить разговор со специалистом. Это изменения в упражнениях, а не медицинское заключение.','es/backend/es_core/synthetic.py; es/docs/API-CONTRACT.md, /trajectory. Медианы fluency_count за каждую неделю: src/profile.json, weekly_fluency. Демо полностью синтетическое.',{time:'3:00-3:20'});
 s.charts.add('line',{position:{left:370,top:232,width:842,height:390},title:'Слов за минуту',titlePlacement:'aboveChart',titleTextStyle:{typeface:FONT,fontSize:25,fill:C.muted},categories:Array.from({length:12},(_,i)=>String(i+1)),series:[{name:'Названо животных',values:profile.weekly_fluency,fill:C.blue,line:{fill:C.blue,width:4},marker:{symbol:'circle',size:7,fill:C.blue}}],hasLegend:false,xAxis:{visible:true,title:{text:'Неделя',textStyle:{typeface:FONT,fontSize:21,fill:C.muted}},textStyle:{typeface:FONT,fontSize:21,fill:C.muted},line:{fill:C.line,width:1}},yAxis:{visible:true,min:10,max:20,majorUnit:5,textStyle:{typeface:FONT,fontSize:22,fill:C.muted},majorGridlines:{fill:C.line,width:1},line:{fill:'none',width:0}},chartFill:C.white,plotAreaFill:C.white,chartLine:{fill:'none',width:0}});
 tx(s,'12',66,265,251,121,110,C.blue,true);
 tx(s,'недель',69,414,239,54,39,C.ink,true);
 tx(s,'Доступ\nпо согласию',69,526,252,75,28,C.teal,true);
 foot(s,'Синтетические данные');

 s=add(p,'Уже работает','В MVP можно пройти пять упражнений: три речевых и два неречевых. Есть локальное распознавание, профиль, программа и экран близкого. Модель Раша помогает подбирать сложность, модель забывания планирует повторы. Их параметры пока проверены на синтетических данных и требуют калибровки. Собственного подтверждённого результата классификатора на ADReSS у нас пока нет.','es/README.md; es/docs/API-CONTRACT.md; es/backend/es_core/matrix.py, PLAYABLE; es/backend/es_core/irt.py; es/backend/es_core/forgetting.py. Скриншот es/pitch/assets/screens/site.png.',{time:'3:20-3:40'});
 await pic(s,path.join(P,'assets/screens/site.png'),469,214,762,421,'Лендинг и примеры интерфейса работающего прототипа Siriva');
 tx(s,'5',65,246,332,128,119,C.blue,true);
 tx(s,'упражнений',70,395,355,51,40,C.ink,true);
 tx(s,'3 речевых\n2 неречевых',70,507,365,92,33,C.teal,true);
 foot(s,'Открывается в браузере. Оценки и параметры требуют калибровки');

 s=add(p,'Следующий шаг - пилот','Мы ищем клинику и научного руководителя, чтобы подготовить пилот на двадцати-тридцати участниках. Хотим проверить удобство, повторяемость речевых метрик и согласие оценки упражнений со специалистами. До этого продукт не проходил проверку на людях. Команда: Shadil Nurmukhammed и Amangeldiev Kaisar.','es-mvp-plan.md, «После MVP»; es/docs/DEMENTIABANK-REQUEST.md; es/pitch/src/build.py, TEAM. 20-30 - планируемый размер пилота. Иллюстрация es/design/assets/es-3d-trajectory-transparent.png.',{time:'3:40-4:00'});
 await pic(s,path.join(ES,'design/assets/es-3d-trajectory-transparent.png'),848,218,363,358,'Абстрактная иллюстрация будущей траектории исследования');
 tx(s,'20-30',64,251,737,129,115,C.blue,true);
 tx(s,'участников',70,406,687,55,37,C.muted);
 tx(s,'Ищем клинику\nи научного руководителя',69,500,780,101,35,C.teal,true);
 foot(s,'Shadil Nurmukhammed, Amangeldiev Kaisar');

 await fs.writeFile(path.join(OUT,'src/content.json'),JSON.stringify(records,null,2));
 await fs.writeFile(path.join(OUT,'SPEECH.md'),'# Siriva: общий спич на 4 минуты\n\nПодробности и источники находятся в заметках слайдов. Роли между участниками не распределены.\n\n'+records.map(r=>`## ${String(r.slide).padStart(2,'0')} ${r.title||'Siriva'} (${r.time})\n\n${r.note}\n\nИсточники: ${r.source}\n`).join('\n'));
 return {slides:records.length,visibleWords:records.map(r=>({slide:r.slide,words:r.visible.join(' ').match(/[\p{L}\p{N}]+/gu)?.length||0}))};
}
