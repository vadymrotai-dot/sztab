/**
 * Discovery Form — 47 запитань для Maxim'а (Pikniko)
 *
 * Мова: українська (Maxim розуміє українську).
 * Технічні терміни і назви категорій залишаються польською — доменна
 * термінологія HoReCa wholesale.
 *
 * Дата створення: 06.05.2026
 * Sprint: Pikniko Discovery
 */

export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'text'
  | 'textarea'
  | 'number'

export interface Question {
  id: string
  question: string
  type: QuestionType
  options?: string[]
  allow_other?: boolean
  hint?: string
  placeholder?: string
  required?: boolean
  min_length?: number
}

export interface Section {
  id: string
  number: number
  title: string
  intro: string
  questions: Question[]
}

export const sections: Section[] = [
  {
    id: 's0',
    number: 0,
    title: 'RODO + власність даних',
    intro:
      'Базові домовленості перш ніж починаємо технічну роботу. Те що тут вирішимо — піде у RODO-угоду між Ziomek Fish і Pikniko.',
    questions: [
      {
        id: '0.1',
        question:
          'Чи ок тобі що дані твоїх клієнтів зберігаються у Sztab, де технічний адміністратор = Ziomek Fish (моя фірма), а власник даних = Pikniko? Підпишемо RODO-угоду перед запуском.',
        type: 'single_choice',
        options: ['Так, ок', 'Так, але треба обговорити деталі', 'Ні, треба інше рішення'],
        required: true,
      },
      {
        id: '0.2',
        question:
          'Через 3 місяці моя operations-роль закінчується. Якщо Sztab покаже реальний ROI — чи готовий розглянути продовження як SaaS-контракт (~2,500–4,000 zł/міс)?',
        type: 'single_choice',
        options: ['Так, готовий розглянути', 'Подивимось по результатах', 'Ні, тільки на ці 3 місяці'],
        required: true,
      },
      {
        id: '0.3',
        question:
          'У мене конфлікт інтересів — я і operations director, і постачальник (Czudowа Marka, SpoonJoy). Пропоную проактивну прозорість: ринкові ціни + щоквартальний review де я показую свої ціни проти інших постачальників. Ок?',
        type: 'single_choice',
        options: ['Так, такий формат ок', 'Хочу інший механізм контролю', 'Треба обговорити'],
        required: true,
        hint: 'Ти можеш у будь-який момент перевірити мої ціни проти ринку.',
      },
    ],
  },
  {
    id: 's1',
    number: 1,
    title: 'Каталог товарів',
    intro:
      'Хочу зрозуміти масштаб і стан каталогу — від цього залежить як будувати order intake.',
    questions: [
      {
        id: '1.1',
        question: 'Скільки активних SKU у каталозі зараз?',
        type: 'number',
        required: true,
        hint: 'Приблизно — точну цифру з Subiekt подивимось пізніше.',
        placeholder: 'напр. 850',
      },
      {
        id: '1.2',
        question: 'Які основні товарні категорії продаєш?',
        type: 'multi_choice',
        options: [
          'Świeże mięso',
          'Wędliny',
          'Ryby/owoce morza',
          'Nabiał',
          'Warzywa/owoce',
          'Mrożonki',
          'Suchy spożywczy',
          'Napoje',
          'Chemia/opakowania',
        ],
        allow_other: true,
        hint: 'Категорії залишаємо польською — це доменна термінологія HoReCa.',
        required: true,
      },
      {
        id: '1.3',
        question: 'Чи є сезонні товари? Які саме і коли пік?',
        type: 'textarea',
        placeholder: 'Напр.: świeże warzywa влітку, choinki у грудні...',
      },
      {
        id: '1.4',
        question: 'У якому форматі тримаєш каталог зараз?',
        type: 'single_choice',
        options: [
          'Тільки Subiekt',
          'Subiekt + Excel дублі',
          'Excel основний, Subiekt вторинний',
          'Папір + memory працівників',
          'Змішано — хаос',
        ],
        required: true,
      },
      {
        id: '1.5',
        question: 'Чи є описи товарів (опис, фото, specs) — чи тільки назва + ціна?',
        type: 'single_choice',
        options: [
          'Тільки назва + ціна',
          'Назва + короткий опис',
          'Повні описи з фото',
          'Частково — деякі мають, деякі ні',
        ],
        required: true,
      },
      {
        id: '1.6',
        question: 'Чи є фотографії товарів зараз? Якщо так — у якому форматі і де зберігаються?',
        type: 'textarea',
        placeholder: 'Напр.: 30% товарів мають фото у Subiekt, решта — без...',
      },
      {
        id: '1.7',
        question: 'Хто додає нові товари у систему і як часто?',
        type: 'textarea',
        placeholder: 'Напр.: Anna, 5–10 товарів на тиждень, вручну у Subiekt...',
        required: true,
      },
      {
        id: '1.8',
        question: 'Чи продаєш мої товари (Czudowа Marka, SpoonJoy)? Який порядок маржі плануєш?',
        type: 'textarea',
        placeholder: 'Напр.: Czudowа — 15–20% маржі, SpoonJoy — поки тестово...',
      },
    ],
  },
  {
    id: 's2',
    number: 2,
    title: 'Клієнти і команда',
    intro:
      'Розмір клієнтської бази + як розподілена робота у твоїх 14 людей.',
    questions: [
      {
        id: '2.1',
        question: 'Скільки активних клієнтів зараз (зробили замовлення за останні 30 днів)?',
        type: 'number',
        required: true,
      },
      {
        id: '2.2',
        question: 'Скільки замовлень на день у середньому?',
        type: 'number',
        required: true,
        hint: 'Це baseline проти якого рахуємо мій bonus — важливо.',
      },
      {
        id: '2.3',
        question: 'Які типи клієнтів?',
        type: 'multi_choice',
        options: [
          'Restauracje',
          'Hotele 3–5*',
          'Catering dietetyczny',
          'Catering imprezowy/eventowy',
          'Stołówki',
          'Cukiernie',
          'Małe sklepy detaliczne',
          'Inni hurtownicy',
        ],
        allow_other: true,
        required: true,
      },
      {
        id: '2.4',
        question: 'Скільки нових клієнтів додається за тиждень? Хто їх приводить?',
        type: 'textarea',
        placeholder: 'Напр.: 2–3/тиждень, через рекомендації від існуючих + 1 sales rep...',
        required: true,
      },
      {
        id: '2.5',
        question: 'Який відсоток клієнтів — постійні (роблять замовлення регулярно), а який — ad-hoc?',
        type: 'textarea',
        placeholder: 'Напр.: 70% regular щотижневі, 30% від випадку до випадку...',
      },
      {
        id: '2.6',
        question: 'Як розподілені 14 людей по ролях?',
        type: 'textarea',
        placeholder: 'Напр.: 3 office (zamówienia + faktуру), 6 водіїв, 4 склад (зміни), 1 sales...',
        required: true,
      },
      {
        id: '2.7',
        question:
          'Чи є sales reps які активно шукають нових клієнтів — чи команда тільки обслуговує inbound замовлення?',
        type: 'single_choice',
        options: [
          'Так, є active sales reps',
          'Тільки inbound — чекаємо замовлень',
          'Mix — частково шукаємо, частково чекаємо',
        ],
        required: true,
      },
    ],
  },
  {
    id: 's3',
    number: 3,
    title: 'Ціни (Pricing)',
    intro:
      'Це найбільший pain point який я бачу у будь-якій hurtownі. Хочу зрозуміти як ти зараз з цим живеш.',
    questions: [
      {
        id: '3.1',
        question: 'Ціни індивідуальні (у кожного клієнта свій cennik) чи є tiers/grupy?',
        type: 'single_choice',
        options: [
          'Тільки індивідуальні — кожен клієнт свої ціни',
          'Є tiers (A/B/C клієнти)',
          'Mix — більшість у tiers, VIP індивідуально',
          'Один cennik для всіх',
        ],
        required: true,
      },
      {
        id: '3.2',
        question:
          'Коли клієнт телефонує — як працівник у офісі швидко знаходить ціну для нього? Memory? Excel? Subiekt?',
        type: 'textarea',
        placeholder: 'Напр.: Anna пам\'ятає основних, для нових дивиться у Subiekt 30 сек...',
        required: true,
      },
      {
        id: '3.3',
        question: 'Як часто змінюються ціни постачальників → твої ціни клієнтам?',
        type: 'single_choice',
        options: [
          'Щодня (świeże produkty)',
          'Щотижня',
          'Раз на 2–4 тижні',
          'Раз на квартал',
          'Рідко',
        ],
        required: true,
      },
      {
        id: '3.4',
        question:
          'Чи бувають ad-hoc negocjacje — клієнт по телефону просить знижку, працівник погоджується сам?',
        type: 'single_choice',
        options: [
          'Так, працівники мають свободу',
          'Тільки до певного %, далі тебе питають',
          'Ні, всі знижки через тебе',
        ],
        required: true,
      },
      {
        id: '3.5',
        question: 'Чи є volume discounts? (купуєш 10 палет → ціна Х, 50 палет → ціна Y)',
        type: 'single_choice',
        options: ['Так, formalne tiers', 'Не formalne — domawiamy', 'Ні'],
        required: true,
      },
      {
        id: '3.6',
        question: 'Чи є default cennik для нових клієнтів — або кожному рахуєш індивідуально?',
        type: 'textarea',
        placeholder: 'Напр.: новий клієнт стартує з cennika B, після 3 міс reviewujemy...',
        required: true,
      },
    ],
  },
  {
    id: 's4',
    number: 4,
    title: 'Оплата і прострочки',
    intro:
      'Cash flow і bad debt — критично для розуміння як будувати invoice + payment tracking.',
    questions: [
      {
        id: '4.1',
        question: 'Які форми оплати приймаєш?',
        type: 'multi_choice',
        options: [
          'Przelew bankowy',
          'Gotówka przy odbiorze',
          'Karta',
          'Odroczona płatność (faktura z terminem)',
          'BLIK',
        ],
        required: true,
      },
      {
        id: '4.2',
        question: 'Які типові терміни płatności?',
        type: 'multi_choice',
        options: ['Przedpłata', '24h', '7 dni', '14 dni', '30 dni', 'Більше 30 dni'],
        required: true,
      },
      {
        id: '4.3',
        question: 'Як зараз трекаєш хто заплатив, хто ні?',
        type: 'textarea',
        placeholder: 'Напр.: Subiekt показує заборгованість, Anna щотижня дзвонить debtorom...',
        required: true,
      },
      {
        id: '4.4',
        question: 'Який відсоток замовлень з прострочкою зараз?',
        type: 'single_choice',
        options: ['<5%', '5–15%', '15–30%', '>30%', 'Не знаю'],
        required: true,
      },
      {
        id: '4.5',
        question: 'Чи є bad debt — клієнти які не платять взагалі? Скільки таких і скільки грошей зависло?',
        type: 'textarea',
        placeholder: 'Напр.: 3 клієнти, ~25K zł zawisło, 2 у sądzie...',
      },
    ],
  },
  {
    id: 's5',
    number: 5,
    title: 'Логістика',
    intro: 'Радіус, маршрути, cutoff times — щоб зрозуміти як планується доставка і де хаос.',
    questions: [
      {
        id: '5.1',
        question: 'Який радіус доставки?',
        type: 'single_choice',
        options: [
          'Тільки Warszawa',
          'Warszawa + bliższe Mazowsze',
          'Cale Mazowsze',
          'Mazowsze + sąsiednie województwa',
          'Cala Polska',
        ],
        required: true,
      },
      {
        id: '5.2',
        question: 'Які дні доставки?',
        type: 'multi_choice',
        options: ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz'],
        required: true,
      },
      {
        id: '5.3',
        question: 'Який cutoff — до якої години замовлення йде на завтрашню доставку?',
        type: 'text',
        placeholder: 'Напр.: 14:00 dnia poprzedniego',
        required: true,
      },
      {
        id: '5.4',
        question: 'Чи є мінімальне замовлення? Скільки?',
        type: 'text',
        placeholder: 'Напр.: 300 zł netto, або brak minimum',
        required: true,
      },
      {
        id: '5.5',
        question: 'Як плануєте маршрути водіям зараз — вручну, Google Maps, чи якийсь tool?',
        type: 'textarea',
        placeholder: 'Напр.: dispatcher рано-вранці 1 годину groupує замовлення по rejonах вручну...',
        required: true,
      },
    ],
  },
  {
    id: 's6',
    number: 6,
    title: 'Subiekt — технічні деталі',
    intro: 'Це критично для інтеграції. Без точних відповідей я не можу спланувати sync.',
    questions: [
      {
        id: '6.1',
        question: 'Subiekt GT чи Nexo?',
        type: 'single_choice',
        options: ['GT', 'Nexo', 'Не знаю — треба запитати IT'],
        required: true,
      },
      {
        id: '6.2',
        question: 'Server — локальний у вас в офісі (on-premise) чи cloud?',
        type: 'single_choice',
        options: ['Локальний у офісі', 'Cloud (Insert hosting)', 'Не знаю'],
        required: true,
      },
      {
        id: '6.3',
        question: 'Хто IT-адмін Subiekt — внутрішня людина чи зовнішня фірма?',
        type: 'textarea',
        placeholder: 'Напр.: zewnętrzna firma X, контакт Y, доступний у годинах...',
        required: true,
      },
      {
        id: '6.4',
        question: 'Чи є вже ліцензія Sfera (для GT) або REST API доступ (для Nexo)?',
        type: 'single_choice',
        options: ['Так, є Sfera/API', 'Ні, треба купити', 'Не знаю'],
        required: true,
        hint: 'Sfera ~1500 zł, REST API у Nexo вбудований.',
      },
      {
        id: '6.5',
        question: 'Який статус KSeF — already integrated, у процесі, чи планується?',
        type: 'single_choice',
        options: ['Already integrated', 'У процесі', 'Планується пізніше', 'Не знаю'],
        required: true,
      },
      {
        id: '6.6',
        question: 'Як кодуєш клієнтів у Subiekt — є якийсь patterned ID (напр. K001, K002)?',
        type: 'textarea',
        placeholder: 'Напр.: K + 4 cyfry chronologicznie, без gap...',
      },
      {
        id: '6.7',
        question: 'Як часто думаєш робити sync Subiekt ↔ Sztab?',
        type: 'single_choice',
        options: [
          'Real-time (кожна зміна)',
          'Щогодини',
          'Кілька разів на день',
          'Раз на день вранці',
        ],
        required: true,
      },
    ],
  },
  {
    id: 's7',
    number: 7,
    title: 'Власна платформа Pikniko',
    intro:
      'Я знаю що ви будуєте паралельно. Хочу зрозуміти scope і timing щоб Sztab не перетинався без сенсу.',
    questions: [
      {
        id: '7.1',
        question: 'Хто будує власну платформу?',
        type: 'single_choice',
        options: ['Внутрішня команда', 'Зовнішня агенція', 'Один freelancer', 'Mix'],
        required: true,
      },
      {
        id: '7.2',
        question: 'Скільки коштує / вже інвестовано?',
        type: 'textarea',
        placeholder: 'Напр.: ~80K wydane, ~120K do końca...',
      },
      {
        id: '7.3',
        question:
          'Який scope — operational platform (orders/invoices internally) чи marketplace для клієнтів (B2B portal)?',
        type: 'textarea',
        placeholder: 'Напр.: B2B portal dla klientów, oni sami składają zamówienia online...',
        required: true,
      },
      {
        id: '7.4',
        question: 'Чи є контракт з агенцією який обмежує паралельну роботу із Sztab? Або вільні руки?',
        type: 'single_choice',
        options: [
          'Вільні руки — можемо паралельно',
          'Є exclusivity clause',
          'Не знаю — треба перевірити',
        ],
        required: true,
      },
    ],
  },
  {
    id: 's8',
    number: 8,
    title: 'Пріоритети — твоїми словами',
    intro: 'Тут не вибір з опцій — пиши як думаєш. Це важливе.',
    questions: [
      {
        id: '8.1',
        question:
          'Якщо завтра у Sztab з\'явиться одна нова функція — яка дасть тобі найбільше value? Чому саме вона?',
        type: 'textarea',
        placeholder: 'Пиши як говориш — без формальностей.',
        min_length: 50,
        required: true,
      },
      {
        id: '8.2',
        question:
          'Що зараз найбільше болить у щоденних operations? Що ти ненавидиш робити вручну і що з\'їдає твій час?',
        type: 'textarea',
        placeholder: 'Перерахуй кілька — pain points = roadmap.',
        min_length: 50,
        required: true,
      },
    ],
  },
]

// Helper: загальна кількість питань
export const totalQuestions = sections.reduce(
  (sum, s) => sum + s.questions.length,
  0,
)

// Helper: знайти question by id
export function findQuestion(id: string) {
  for (const s of sections) {
    const q = s.questions.find((q) => q.id === id)
    if (q) return { section: s, question: q }
  }
  return null
}
