/* Курс по БПЛА · розділ «Гайди»: покрокове налаштування польотника (Betaflight), пульта (EdgeTX) і радіолінії
 * ExpressLRS. Загальновідомий порядок без прив’язки до конкретної плати чи цілі прошивки. 3D-сцена показує вузол
 * або орган керування, про який іде мова на кроці. */
import * as T from 'three';
import { narrowMQ, ok3d, reduceMotion, root, stageEl } from '../engine/core.js';
import { applyLook, fitDist, focusComp, homeView, LB, S, setView, updateSpinBtn, wbLine } from '../engine/anim.js';
import { ctl, matMesh, shadowMesh } from '../engine/demos.js';
import { clamp, pressSeg } from './antlab.js';
import { RAD, radG, radPilotAim, radScenario, radScreen, radStep, radTX, radVisual, RP } from './radio.js';
import { $, goMode, setText } from '../ui/ui.js';

/* сцена кроку: drone — модель дрона з фокусом на вузлі; radio — пульт крупно з підсвіченим органом; link — пульт і дрон */
const GUIDES = {
  bf: {
    name: 'Betaflight', title: 'Польотник: Betaflight',
    intro: 'Загальний порядок для будь-якої плати з Betaflight — від резервної копії до першого польоту. Назви вкладок — як у Betaflight Configurator; у різних версіях пункти можуть трохи відрізнятися.',
    steps: [
      { t: 'Підготовка й безпека', cap: 'Пропелери знімаємо першими', scene: { k: 'drone', f: 'props' },
        do: ['Зніміть пропелери й не ставте їх до кінця налаштування та перевірки моторів.',
          'Встановіть Betaflight Configurator (або відкрийте веб-версію в Chrome чи Edge) і візьміть USB-кабель, що передає дані, а не лише заряджає.',
          'Для більшості вкладок досить живлення від USB. Батарею підключайте лише для перевірки моторів, ESC і VTX; нову збірку вперше — через запобіжник (smoke stopper).',
          'Windows: якщо плата не з’являється в списку портів, встановіть драйвер STM32 VCP (або скористайтеся утилітою ImpulseRC Driver Fixer).'],
        why: 'Мотор, що раптово запустився з пропелером, — найчастіша причина травм на верстаті. Кабель «лише для зарядки» — найчастіша причина, чому плата «не бачиться».' },
      { t: 'Резервна копія налаштувань', cap: 'Польотник: налаштування живуть у його пам’яті', scene: { k: 'drone', f: 'fc' },
        do: ['Підключіться (Connect) і відкрийте вкладку CLI.',
          'Введіть <code>diff all</code> і збережіть вивід у файл (Save to File).',
          'Запишіть версію прошивки й назву цілі (target) — команда <code>version</code>; вони знадобляться для перепрошивки.'],
        why: '<code>diff all</code> зберігає лише відмінності від заводських налаштувань: порти, режими, рейти, OSD. Між різними версіями Betaflight diff переносять вручну й частинами: назви параметрів змінюються.' },
      { t: 'Прошивка (Firmware Flasher)', cap: 'Польотник: прошивка через USB, режим DFU', scene: { k: 'drone', f: 'fc' },
        do: ['Оберіть ціль своєї плати — з документації виробника або з команди <code>version</code> — і стабільний реліз.',
          'Сучасні версії збираються на сервері: позначте потрібні опції — протокол приймача (для ExpressLRS — CRSF), OSD, GPS, телеметрію, керування VTX.',
          'Full chip erase — при переході між основними версіями; після нього налаштування заводські.',
          'Load Firmware, потім Flash Firmware. Якщо плата не перейшла в завантажувач — утримуйте кнопку BOOT під час підключення USB (режим DFU).'],
        why: 'Ціль визначає розпіновку: які піни — мотори, UART, світлодіоди. З чужою ціллю мотори можуть не запуститися, а порти — переплутатися.',
        warn: 'Не від’єднуйте USB під час прошивки. Якщо процес обірвався — плату зазвичай рятує режим DFU.',
        links: [{ fc: 'dfu', txt: 'Режим DFU в 3D' }] },
      { t: 'Setup: орієнтація й акселерометр', cap: 'Польотник: гіроскоп і акселерометр на платі', scene: { k: 'drone', f: 'fc' },
        do: ['Поставте дрон рівно й натисніть Calibrate Accelerometer.',
          'Нахиляйте й повертайте дрон: 3D-модель у вкладці має рухатися так само.',
          'Модель повертається не туди — задайте Board and Sensor Alignment у Configuration (поворот плати по yaw на 90°, 180° або 270°).'],
        why: 'З неправильною орієнтацією польотник «думає», що нахиляється в інший бік, і дрон перевертається одразу після зльоту. Акселерометр потрібен режимам ANGLE і HORIZON.' },
      { t: 'Ports: UART для приймача й периферії', cap: 'Приймач підключений до UART польотника', scene: { k: 'drone', f: 'rx' },
        do: ['Знайдіть UART, до якого припаяний приймач (TX приймача → RX польотника, RX приймача → TX польотника), і ввімкніть на ньому Serial Rx.',
          'На цьому ж UART не вмикайте інших функцій.',
          'Цифровий відеопередавач (DJI, Walksnail, HDZero): на його UART — MSP, OSD — через MSP DisplayPort.',
          'Аналоговий VTX з керуванням: Peripherals → VTX (SmartAudio або IRC Tramp) на його UART. GPS — Sensors → GPS на своєму UART.',
          'USB VCP лишайте з MSP — інакше Configurator не підключиться.'],
        why: 'UART — двопровідна послідовна лінія. Польотник має знати, хто на якому порту, інакше канали приймача не надходять.',
        links: [{ sig: 'ctrl', txt: 'Ланцюжок керування в «Сигналах»' }] },
      { t: 'Configuration: мікшер, ESC, функції', cap: 'ESC і мотори: протокол DShot', scene: { k: 'drone', f: 'esc' },
        do: ['Mixer — Quad X (або ваш тип рами). Пропелери за схемою Props Out — увімкніть Motor direction is reversed. У сучасних версіях Betaflight розділ Mixer перенесено у вкладку Motors.',
          'ESC/Motor protocol — DShot300 або DShot600.',
          'Bidirectional DShot — якщо прошивка ESC підтримує (BLHeli_32, AM32, Bluejay): оберти моторів потрібні RPM-фільтру. Вкажіть кількість полюсів моторів (типово 14).',
          'Craft name — для OSD. Функції AIRMODE, TELEMETRY, OSD — за потреби.',
          'Arming: максимальний кут армування (за замовчуванням 25°).'],
        why: 'Протокол ESC і напрям моторів мають відповідати обладнанню. Bidirectional DShot помітно покращує фільтрацію шумів моторів.',
        links: [{ mot: 'in', txt: 'Props In / Props Out в 3D' }] },
      { t: 'Power & Battery', cap: 'Батарея: напруга й струм для OSD', scene: { k: 'drone', f: 'battery' },
        do: ['Voltage Meter — Onboard ADC; Current Meter — Onboard ADC, якщо датчик струму є на платі чи ESC.',
          'Підключіть батарею, виміряйте напругу мультиметром і підкоригуйте Scale, щоб Configurator показував те саме.',
          'Струм: після польоту порівняйте спожиті mAh з тим, що «долив» зарядний пристрій, і підкоригуйте scale датчика.',
          'Пороги на банку — мінімальний, попередження, максимальний — під свою хімію: LiPo, LiHV і Li-ion мають різні межі.'],
        why: 'Попередження про розряд працюють лише з відкаліброваними датчиками. Глибокий розряд псує батарею.' },
      { t: 'Receiver: протокол і карта каналів', cap: 'Стіки пульта → канали Roll, Pitch, Yaw, Throttle', scene: { k: 'radio', hl: 'R', page: 'mon' },
        do: ['Receiver Mode — Serial (via UART); Serial Receiver Provider — CRSF (для ExpressLRS і Crossfire).',
          'Channel Map — AETR1234: як у мікшері пульта (CH1 Ail, CH2 Ele, CH3 Thr, CH4 Rud).',
          'RSSI Channel — вимкнено: якість зв’язку ExpressLRS надходить телеметрією (Link Quality, RSSI dBm).',
          'Рухайте стіки: вправо або вгору — значення зростає до ≈2000, центр ≈1500, мінімум ≈1000. Напрям обернений — реверс на пульті (Outputs).'],
        why: 'Неправильна карта каналів — класична причина, чому дрон не армиться (газ читається не з того каналу) або керується не тими осями.',
        links: [{ scen: 'map', txt: 'Помилка карти каналів' }, { scen: 'rev', txt: 'Реверс тангажу' }] },
      { t: 'Modes: тумблери й режими', cap: 'Тумблер SF → CH5 (AUX1) → ARM', scene: { k: 'radio', hl: 'SF', page: 'mix' },
        do: ['Add Range для ARM: AUX1 (CH5), 1700–2100 — нижнє положення 2-позиційного тумблера.',
          'ANGLE і HORIZON — на AUX2 (3-позиційний тумблер), кожному свій діапазон; коли жоден не активний — Acro.',
          'BEEPER — на окремий тумблер, FLIP OVER AFTER CRASH (turtle) — на інший.',
          'Перемикайте тумблери: значення каналу заходить у діапазон — режим підсвічується.'],
        why: 'У стандартних режимах перемикачів ExpressLRS передає AUX1 у кожному пакеті одним бітом — тому ARM ставлять саме на CH5 і на 2-позиційний тумблер.',
        links: [{ mode: 'radio', txt: 'Спробувати в розділі «Пульт»' }, { scen: 'arm3', txt: 'Помилка: ARM на 3-позиційному' }] },
      { t: 'Motors: нумерація й напрям', cap: 'Мотори 1–4 за схемою Quad X', scene: { k: 'drone', f: 'motors' },
        do: ['Пропелери зняті, батарея підключена. Увімкніть перемикач підтвердження ризиків.',
          'Повзунками по черзі запускайте мотори на малих обертах і звіряйте зі схемою Quad X: 1 — задній правий, 2 — передній правий, 3 — задній лівий, 4 — передній лівий.',
          'Перевірте напрям обертання. Неправильний — змініть у майстрі напрямку моторів у Configurator або в конфігураторі ESC (BLHeli, Bluejay, AM32).',
          'Порядок переплутаний — перепризначте мотори (майстер у вкладці Motors у сучасних версіях або CLI).'],
        why: 'Мотор не на своєму місці чи з неправильним напрямом перекидає дрон одразу при армуванні.',
        warn: 'Ніколи не тестуйте мотори з пропелерами.',
        links: [{ mot: 'test', txt: 'Тест 1→2→3→4 у 3D' }, { mot: 'wrong', txt: 'Неправильно встановлений проп у 3D' }] },
      { t: 'Failsafe: дрон без сигналу', cap: 'Пульт і дрон: що буде, коли зв’язок зник', scene: { k: 'link' },
        do: ['Стадія 2 — процедура: Drop (вимкнути мотори — для польотів поруч), Land (вирівнятися й знизитися з фіксованим газом) або GPS Rescue (повернення; потрібен GPS і окреме налаштування).',
          'Канали стадії 1: стіки — Auto, AUX — Hold (тримати останнє значення).',
          'Перевірка без пропелерів: армуйте, вимкніть пульт — мотори мають зупинитися після затримки (failsafe_delay), а Configurator покаже RXLOSS і FAILSAFE.',
          'Приймач ExpressLRS при втраті зв’язку перестає слати пакети — польотник це розпізнає.'],
        why: 'Failsafe вирішує, що робить дрон, коли пульт не чути. Політ зі «застиглим» газом недопустимий.',
        links: [{ scen: 'fs', txt: 'Failsafe у розділі «Пульт»' }] },
      { t: 'OSD і відео', cap: 'Відеопередавач: OSD накладається на картинку', scene: { k: 'drone', f: 'vtx' },
        do: ['Аналогова камера: формат PAL або NTSC, як у камери. Цифрова система: OSD через MSP DisplayPort.',
          'Елементи: напруга батареї (краще середня на банку), Link Quality, RSSI dBm, таймер, режим польоту, попередження, назва апарата.',
          'Аналоговий VTX: завантажте таблицю VTX від виробника й обирайте лише дозволені у вашій країні частоти й потужність.'],
        why: 'OSD — головне джерело стану дрона в польоті: заряд, якість зв’язку, режим і попередження польотника.' },
      { t: 'PID, фільтри й рейти', cap: 'Польотник: регулятор і фільтри', scene: { k: 'drone', f: 'fc' },
        do: ['Для першого польоту — PID і фільтри за замовчуванням або перевірений пресет для свого класу (вкладка Presets).',
          'Rates (Actual): центр — чутливість біля центру стіка, Max Rate — швидкість обертання на краю, Expo — плавність переходу.',
          'PID змінюйте по одному параметру й з аналізом Blackbox, а не навмання.'],
        why: 'Стандартні налаштування літають на більшості збірок. Агресивні PID без аналізу перегрівають мотори.' },
      { t: 'Перший політ: чек-лист', cap: 'Пульт і дрон готові', scene: { k: 'link' },
        do: ['Ще раз <code>diff all</code> — збережіть робочу конфігурацію.',
          'Пропелери за схемою (Props In чи Out), гайки затягнуті, батарея закріплена.',
          'Перевірено: ARM і DISARM з тумблера, напрямки стіків у Receiver, failsafe.',
          'Відкрите безпечне місце без людей; дотримуйтесь місцевих правил польотів.',
          'Перший зліт — у режимі ANGLE, невисоко; після посадки перевірте температуру моторів і ESC.'],
        why: 'Більшість проблем першого польоту ловиться на землі за кілька хвилин.',
        links: [{ mode: 'radio', txt: 'Потренуватися в розділі «Пульт»' }] }
    ]
  },
  tx: {
    name: 'Пульт · EdgeTX', title: 'Пульт: EdgeTX',
    intro: 'Налаштування пульта з EdgeTX для квадрокоптера з ExpressLRS — на прикладі TX16S; для інших пультів з EdgeTX кроки ті самі. Назви меню — EdgeTX 2.x для кольорових екранів.',
    steps: [
      { t: 'Режим стіків і калібрування', cap: 'Стіки: калібрування до упорів', scene: { k: 'radio', hl: 'L', page: 'sys' },
        do: ['SYS → Radio Setup: Mode 2 (газ ліворуч) — найпоширеніший; порядок каналів за замовчуванням — AETR.',
          'SYS → Hardware → Calibration: відпустіть стіки, потенціометри й слайдери в центр — далі.',
          'Проведіть обидва стіки по колу до упорів, потенціометри й слайдери — від краю до краю — завершіть.',
          'Перевірте в моніторі каналів: центр — 0 %, краї — ±100 %.'],
        why: 'Без калібрування центр і краї «пливуть»: канал не доходить до 1000 і 2000 мкс або центр не 1500.' },
      { t: 'Оновлення EdgeTX і SD-карта', cap: 'Завантажувач: трими T1 і T4 до центру + живлення', scene: { k: 'radio', hl: 'T1', page: 'sys' },
        do: ['Збережіть папки MODELS і RADIO з SD-карти (пульт → USB → режим накопичувача).',
          'Завантажте прошивку для своєї моделі пульта (через EdgeTX Buddy або з сайту EdgeTX) і вміст SD-карти тієї ж версії: звуки, скрипти, теми.',
          'Завантажувач на TX16S: вимкніть пульт, затисніть обидва горизонтальні трими до центру й натисніть живлення. Далі — запис прошивки з SD-карти або оновлення через EdgeTX Buddy по USB.'],
        why: 'Версії прошивки й SD-карти мають збігатися, інакше бракуватиме звуків, віджетів чи скриптів.' },
      { t: 'Нова модель', cap: 'MDL: вибір і створення моделі', scene: { k: 'radio', hl: 'MDL', page: 'main' },
        do: ['Довге натискання MDL — вибір моделі; створіть нову.',
          'Назвіть її як дрон — назва видна на головному екрані.',
          'Одна модель на один дрон: свої канали, телеметрія, таймери.'],
        why: 'Окрема модель для кожного дрона захищає від польоту з чужими налаштуваннями.' },
      { t: 'Радіомодуль: внутрішній ExpressLRS', cap: 'Внутрішній модуль ELRS і антена', scene: { k: 'radio', hl: 'ANT', page: 'main' },
        do: ['MDL → Setup → Internal RF: режим CRSF (для пульта з вбудованим ExpressLRS); External RF — вимкнено.',
          'Із зовнішнім модулем у JR-відсіку навпаки: Internal RF вимкнено, External RF — CRSF; швидкість обміну — рекомендована для вашого пульта.',
          'Діапазон каналів — CH1–CH16.'],
        why: 'Через CRSF пульт передає модулю канали, а назад отримує телеметрію.' },
      { t: 'Inputs: стіки без експоненти', cap: 'Входи: стіки з вагою 100 %', scene: { k: 'radio', hl: 'R', page: 'mon' },
        do: ['MDL → Inputs: Ail, Ele, Thr, Rud — з відповідних стіків, вага 100 %, без expo.',
          'Експоненту й швидкість обертання задайте рейтами в Betaflight — так налаштування живуть разом з дроном.'],
        why: 'Подвійна експонента — на пульті й у польотнику — робить керування непередбачуваним біля центру.' },
      { t: 'Mixes: порядок каналів і тумблери', cap: 'Мікшер: SF → CH5 (ARM)', scene: { k: 'radio', hl: 'SF', page: 'mix' },
        do: ['CH1 — Ail, CH2 — Ele, CH3 — Thr, CH4 — Rud (порядок AETR, як Betaflight AETR1234).',
          'CH5 (AUX1) — ARM на 2-позиційному тумблері, наприклад SF.',
          'CH6 — режими на 3-позиційному (SB), CH7 — біпер (SH), CH8 — turtle (SE). Щоб обрати джерело, у полі Source просто перемкніть потрібний тумблер — EdgeTX підставить його.',
          'Вага 100 %, offset 0.'],
        why: 'Мікшер — карта «який орган керування в якому каналі». Польотник бачить лише канали, не тумблери.',
        links: [{ mode: 'radio', txt: 'Призначити канали в розділі «Пульт»' }] },
      { t: 'Outputs і монітор каналів', cap: 'TELE (довге натискання): монітор каналів', scene: { k: 'radio', hl: 'TELE', page: 'mon' },
        do: ['MDL → Outputs: межі −100…+100 %, Subtrim 0, центр 1500 мкс — канал ходить від 988 до 2012 мкс.',
          'Реверс каналу — лише якщо в Betaflight напрям обернений.',
          'Довге натискання TELE — монітор каналів: перемикайте кожен тумблер і переконайтеся, що рухається саме його канал.'],
        why: 'Betaflight очікує 1000–2000 мкс з центром 1500. Субтрим чи урізані межі зсувають центр і мінімум газу.' },
      { t: 'Трими, газ і стартові перевірки', cap: 'Тример газу T3 — у нулі', scene: { k: 'radio', hl: 'T3', page: 'main' },
        do: ['Трими на квадрокоптері — у нулі; їх можна вимкнути для моделі. Стабілізацію робить польотник.',
          'Попередження про газ — увімкнене: пульт не запустить радіомодуль, поки газ не внизу.',
          'Попередження про тумблери: задайте безпечні стартові положення (ARM вимкнено).'],
        why: 'Зсунутий тример газу піднімає мінімум вище 1050 мкс — Betaflight не армиться (THROTTLE).',
        links: [{ scen: 'trim', txt: 'Помилка: тример газу' }] },
      { t: 'Спецфункції й логічні перемикачі', cap: 'Тумблер ARM: голос і таймер', scene: { k: 'radio', hl: 'SF', page: 'main' },
        do: ['Special Functions: голосові «armed» і «disarmed» на тумблер ARM, озвучення напруги батареї.',
          'Таймер 1 — старт від тумблера ARM: показує реальний час польоту.',
          'Logical Switches — умови з кількох джерел, наприклад «ARM, лише коли газ унизу» (AND тумблера й Thr < −95 %).'],
        why: 'Звук і таймер дають інформацію, не відволікаючи від окулярів.' },
      { t: 'Телеметрія', cap: 'Сторінка телеметрії на екрані пульта', scene: { k: 'radio', hl: 'TELE', page: 'tele' },
        do: ['Після з’єднання з приймачем: MDL → Telemetry → Discover new sensors.',
          'З’являться 1RSS (сила сигналу, дБм), RQly (якість зв’язку, %), RxBt (напруга батареї дрона), FM (режим польоту), TPWR (потужність передавача) та інші.',
          'Виведіть потрібні значення віджетами на головний екран і налаштуйте сповіщення про слабкий сигнал.'],
        why: 'Телеметрія показує стан дрона й лінку на пульті — навіть без OSD.' },
      { t: 'Резервна копія моделей', cap: 'SYS: налаштування пульта', scene: { k: 'radio', hl: 'SYS', page: 'sys' },
        do: ['Після налаштування скопіюйте папку MODELS із SD-карти на комп’ютер.',
          'EdgeTX Companion дозволяє редагувати й зберігати моделі на комп’ютері.'],
        why: 'Модель із правильними каналами відновлюється за хвилину, а не налаштовується заново.' }
    ]
  },
  elrs: {
    name: 'ExpressLRS', title: 'Радіолінія: ExpressLRS',
    intro: 'ExpressLRS — відкрита система радіокерування: передавач (модуль у пульті або в JR-відсіку) і приймач на дроні. Гайд — для версій 3.x, без прив’язки до конкретного обладнання.',
    steps: [
      { t: 'Що має збігатися', cap: 'Передавач у пульті ↔ приймач на дроні', scene: { k: 'link' },
        do: ['Діапазон: 2,4 ГГц з 2,4 ГГц, 868/915 МГц з 868/915 МГц.',
          'Основна версія прошивки (наприклад, 3.x з 3.x).',
          'Регіональний домен: для 868/915 МГц — FCC 915, EU 868 тощо; для 2,4 ГГц у ЄС — варіант LBT.',
          'Bind phrase (фраза прив’язки) — або ручний біндинг.'],
        why: 'Різні домени, основні версії чи фрази — найчастіші причини «не з’єднуються».',
        warn: 'Потужність і частоти — лише в межах дозволеного у вашій країні.' },
      { t: 'Прошивка через ExpressLRS Configurator', cap: 'Приймач ExpressLRS на дроні', scene: { k: 'drone', f: 'rx' },
        do: ['Встановіть ExpressLRS Configurator, оберіть стабільну версію, категорію й модель пристрою (TX-модуль або приймач).',
          'Метод: WiFi (через вбудований веб-інтерфейс), Betaflight Passthrough (приймач через USB польотника), EdgeTX Passthrough (модуль через USB пульта) або UART (USB-UART адаптер).',
          'Опції: bind phrase, регіональний домен, домашня мережа WiFi для зручних оновлень.',
          'Build & Flash. Після прошивки перевірте версію в Lua-скрипті або веб-інтерфейсі.'],
        why: 'Модуль і приймач прошиваються однаково, але з різними цілями. Bind phrase зашивається в обидва.' },
      { t: 'Bind phrase', cap: 'Індикатор приймача: зв’язок', scene: { k: 'drone', f: 'rx' },
        do: ['Задайте однакову фразу для TX і RX у Configurator (або у веб-інтерфейсі пристрою).',
          'Після прошивки обидва з’єднаються самі — кнопка біндингу не потрібна.',
          'Фраза перетворюється на ідентифікатор (UID); використовуйте власну, унікальну.'],
        why: 'Однакова фраза — однаковий UID: приймач слухає лише свій передавач.',
        links: [{ rx: 'linked', txt: 'Індикатор «зв’язок» у 3D' }] },
      { t: 'Біндинг без фрази', cap: 'Індикатор приймача: режим біндингу', scene: { k: 'drone', f: 'rx' },
        do: ['Переведіть приймач у режим біндингу: тричі поспіль увімкніть і вимкніть живлення або дайте з Betaflight CLI команду <code>bind_rx</code> (якщо версія її підтримує).',
          'Індикатор приймача блимає подвійно — чекає біндингу.',
          'На пульті: SYS → Tools → ExpressLRS → Bind.',
          'Індикатор горить постійно — зв’язок є.'],
        why: 'Ручний біндинг потрібен, коли приймач прошитий без фрази або ви підключаєте його до іншого пульта.',
        links: [{ rx: 'bind', txt: 'Індикатор біндингу в 3D' }] },
      { t: 'Приймач ↔ польотник', cap: 'Приймач на UART польотника', scene: { k: 'drone', f: 'rx' },
        do: ['Пайка: TX приймача → RX польотника, RX приймача → TX польотника, 5 В і GND.',
          'Betaflight: Ports — Serial Rx на цьому UART; Receiver — Serial (via UART), CRSF; функція TELEMETRY увімкнена.',
          'Антену приймача виведіть подалі від карбону й дротів; дві антени (diversity) — під 90° одна до одної.'],
        why: 'CRSF — двосторонній протокол: канали йдуть у польотник, телеметрія (батарея, режим) — назад на пульт.',
        links: [{ sig: 'tele', txt: 'Ланцюжок телеметрії в «Сигналах»' }, { lab: 'rx', txt: 'Антена приймача на стенді' }] },
      { t: 'Lua-скрипт: головні параметри', cap: 'SYS → Tools → ExpressLRS', scene: { k: 'radio', hl: 'SYS', page: 'tele' },
        do: ['Скопіюйте elrsV3.lua у SCRIPTS/TOOLS на SD-карті й відкрийте SYS → Tools → ExpressLRS.',
          'Packet Rate: вища частота — менша затримка; нижча — вища чутливість і дальність.',
          'Telem Ratio: частка пакетів на телеметрію; Std — за замовчуванням.',
          'Switch Mode: Hybrid (AUX2–AUX8 мають кілька положень — для тумблерів) або Wide (більша роздільність для потенціометрів, але рідше оновлення).',
          'TX Power: максимальна потужність і Dynamic — передавач сам знижує потужність, коли зв’язок добрий.',
          'Model Match: приймач з’єднується лише з моделлю з тим самим номером в EdgeTX.'],
        why: 'Ці параметри — компроміс між затримкою, дальністю й роздільністю каналів.',
        links: [{ lab: 'rx', txt: 'Частота пакетів і чутливість на стенді' }] },
      { t: 'Перевірка лінку', cap: 'Телеметрія: 1RSS, RQly, TPWR', scene: { k: 'radio', hl: 'TELE', page: 'tele' },
        do: ['Lua-скрипт показує з’єднання й частоту пакетів; у телеметрії з’являються 1RSS, RQly, RSNR, TPWR.',
          'Поруч з дроном RQly має бути 100 %.',
          'Betaflight → Receiver: стіки й тумблери рухають свої канали.',
          'Без пропелерів перевірте failsafe: вимкніть пульт — польотник покаже RXLOSS і зупинить мотори.'],
        why: 'Лінк, перевірений на землі, — запорука того, що дрон не втратить керування в повітрі.',
        links: [{ scen: 'fs', txt: 'Failsafe у розділі «Пульт»' }] },
      { t: 'Оновлення по WiFi', cap: 'Індикатор приймача: режим WiFi', scene: { k: 'drone', f: 'rx' },
        do: ['Приймач: увімкніть WiFi з Lua-скрипта (або він увімкнеться сам після заданого часу без зв’язку) — індикатор блимає швидко.',
          'Підключіться до мережі «ExpressLRS RX» (пароль expresslrs) і відкрийте 10.0.0.1.',
          'Завантажте файл прошивки, зібраний у Configurator, або оберіть метод WiFi в самому Configurator.',
          'Модуль у пульті — так само, мережа «ExpressLRS TX».'],
        why: 'WiFi дозволяє оновлювати приймач, не розбираючи дрон.',
        links: [{ rx: 'wifi', txt: 'Індикатор WiFi у 3D' }] },
      { t: 'Типові проблеми', cap: 'Пульт ↔ дрон: шукаємо, де розрив', scene: { k: 'link' },
        do: ['Немає зв’язку: різні основні версії, фрази чи домени; приймач у режимі WiFi або біндингу.',
          'Канали не доходять у Betaflight: не той UART, протокол не CRSF, переплутані TX і RX.',
          'Слабкий сигнал зблизька: пошкоджена антена, антена не того діапазону, антена притиснута до карбону.',
          'Немає телеметрії: Telem Ratio вимкнено або не підключений провід TX приймача.',
          'Model Match: номер моделі на пульті не збігається з прив’язаним.'],
        why: 'Більшість проблем ExpressLRS — у налаштуваннях, а не в залізі.',
        links: [{ lab: 'rx', txt: 'Антенний стенд' }] }
    ]
  }
};
const GD = { g: 'bf', i: 0, done: {} };
const gdStep = () => GUIDES[GD.g].steps[GD.i];
function gdLoad() { try { GD.done = JSON.parse(localStorage.getItem('fpvGuideDone') || '{}') || {}; } catch (e) { GD.done = {}; } }
function gdSave() { try { localStorage.setItem('fpvGuideDone', JSON.stringify(GD.done)); } catch (e) { /* сховище недоступне */ } }

/* ---------- 3D-сцена кроку ---------- */
export function gdScene(reframe) {
  if (!ok3d || S.mode !== 'guides') return;
  const sc = gdStep().scene || { k: 'drone', f: 'fc' }, drone = sc.k === 'drone', rad = !drone;
  root.visible = matMesh.visible = shadowMesh.visible = drone; wbLine.visible = false;
  if (radG) { radG.visible = rad; RP.arena.visible = sc.k === 'link'; radTX.visible = rad; }
  S.sel = drone && sc.f ? sc.f : null; S.ghost = !!S.sel; applyLook();
  RAD.hl = sc.hl || null; RAD.hlT = sc.hl ? 1e9 : 0;
  if (sc.page) { RAD.page = sc.page; RAD.scrT = 1; }
  if (!reframe) return;
  ctl.auto = false; updateSpinBtn();
  if (drone) { if (sc.f) focusComp(sc.f); else homeView(); }
  else if (sc.k === 'radio') { RAD.view = 'guide'; setView(new T.Vector3(0, 14.9, -0.5), 0, 0.6, fitDist(14.2)); }
  else { RAD.view = 'pilot'; radPilotAim(); }
}
export function guideEnter() { RAD.tipT = 0; RAD.hover = null; gdScene(true); gdMark(); }
export function guideExit() {
  RAD.hl = null; RAD.hlT = 0;
  for (const [k, e] of LB) if (k.startsWith('rad')) e.on = false;
}
export function tickGuide(dt, now) {
  if (!radG || !radG.visible) return;
  radStep(dt); radVisual(dt, now);
  RAD.scrT += dt; if (RAD.scrT > 0.12) { RAD.scrT = 0; radScreen(); }
}

/* ---------- панель ---------- */
function gdLink(l) {
  const a = l.fc ? `data-fc="${l.fc}"` : l.mot ? `data-mot="${l.mot}"` : l.rx ? `data-rx="${l.rx}"` : l.sig ? `data-sig="${l.sig}"` : l.lab ? `data-lab="${l.lab}"` : l.mode ? `data-mode="${l.mode}"` : `data-gscen="${l.scen}"`;
  return `<button type="button" class="lnk" ${a}>${l.txt}</button>`;
}
function gdRender() {
  const G = GUIDES[GD.g];
  pressSeg($('gdTabs'), 'gd', GD.g);
  setText($('gdTitle'), G.title); setText($('gdIntro'), G.intro);
  $('gdSteps').innerHTML = G.steps.map((s, i) => `<li data-i="${i}">
    <div class="gs-h"><button type="button" data-gstep="${i}" aria-controls="gsb${i}"><span class="n">${i + 1}</span><b>${s.t}</b></button>
    <label class="gs-ok"><input type="checkbox" data-gok="${i}"><span>готово</span></label></div>
    <div class="gs-b" id="gsb${i}">
      <ol class="gs-do">${s.do.map(d => `<li>${d}</li>`).join('')}</ol>
      <p class="gs-why"><b>Навіщо.</b> ${s.why}</p>
      ${s.warn ? `<p class="gs-warn"><b>Увага.</b> ${s.warn}</p>` : ''}
      ${s.links ? `<div class="gs-links">${s.links.map(gdLink).join('')}</div>` : ''}
    </div></li>`).join('');
  gdMark();
}
function gdMark() {
  const G = GUIDES[GD.g], n = G.steps.length;
  document.querySelectorAll('#gdSteps > li').forEach((li, i) => {
    const done = !!GD.done[GD.g + ':' + i];
    li.classList.toggle('cur', i === GD.i); li.classList.toggle('done', done);
    const cb = li.querySelector('[data-gok]'); if (cb) cb.checked = done;
    const b = li.querySelector('[data-gstep]'); if (b) b.setAttribute('aria-expanded', String(i === GD.i));
  });
  setText($('gdPos'), `${GD.i + 1} / ${n}`);
  const k = G.steps.filter((_, i) => GD.done[GD.g + ':' + i]).length;
  $('gdBar').style.width = `${(k / n * 100).toFixed(1)}%`;
  setText($('gdDone'), `виконано ${k} з ${n}`);
  const s = gdStep();
  setText($('ghT'), `${G.name} · крок ${GD.i + 1}`); setText($('ghS'), s.t); setText($('ghC'), s.cap || '');
  $('gdPrev').disabled = GD.i === 0; $('gdNext').disabled = GD.i === n - 1;
}
function gdGo(i, scroll) {
  const n = GUIDES[GD.g].steps.length;
  GD.i = clamp(i, 0, n - 1); gdMark(); gdScene(true);
  if (scroll) { const li = document.querySelector(`#gdSteps > li[data-i="${GD.i}"]`); if (li && li.getBoundingClientRect().top < (narrowMQ.matches ? stageEl.getBoundingClientRect().bottom : 0)) li.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); }
}
function gdSetGuide(g) { if (!GUIDES[g]) return; GD.g = g; GD.i = 0; gdRender(); gdScene(true); }
export function gdUIInit() {
  if (!$('gdPanel')) return;
  gdLoad();
  $('gdTabs').innerHTML = Object.entries(GUIDES).map(([id, g]) => `<button type="button" data-gd="${id}">${g.name}</button>`).join('');
  $('gdPanel').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.gd) gdSetGuide(d.gd);
    else if (d.gstep != null) gdGo(+d.gstep);
    else if (b.id === 'gdPrev') gdGo(GD.i - 1, true);
    else if (b.id === 'gdNext') gdGo(GD.i + 1, true);
    else if (d.gscen) { goMode('radio'); radScenario(d.gscen); }
  });
  $('gdPanel').addEventListener('change', e => {
    const t = e.target; if (t.dataset.gok == null) return;
    const key = GD.g + ':' + t.dataset.gok;
    if (t.checked) GD.done[key] = 1; else delete GD.done[key];
    gdSave(); gdMark();
  });
  gdRender();
}
