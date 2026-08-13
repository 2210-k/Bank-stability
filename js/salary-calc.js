// Экспортируем списки работ и должностей для построения UI
export const regularJobs = [
  { name: 'Шахта', salary: 300, type: 'fixed', emoji: '⛏️' },
  { name: 'Курьер', salary: { perOrder: 80, maxOrders: 9 }, type: 'variable', emoji: '🛵' },
  { name: 'Почта', salary: 1000, type: 'fixed', emoji: '📪' },
  { name: 'Такси', salary: { perClient: 180, maxClients: 7 }, type: 'taxi', emoji: '🚕' },
  { name: 'Автобус', salary: 1600, type: 'fixed', emoji: '🚌' },
  { name: 'Мусоровоз', salary: 2700, type: 'fixed', emoji: '🚮' },
  { name: 'Развозчик', salary: 1400, type: 'fixed', emoji: '🚚' },
  { name: 'Дальнобойщик', salary: null, type: 'custom', emoji: '🚛' }
];

export const govJobs = [
  { organization: 'ЕСС', emoji: '🚒', positions: ['Водитель', 'Пожарный', 'Спасатель', 'Инспектор', 'Фельдшер', 'Врач', 'Нарколог', 'Хирург'] },
  { organization: 'МВД', emoji: '👮', positions: ['Рядовой', 'Мл. сержант', 'Сержант', 'Старшина', 'Прапорщик', 'Мл. лейтенант', 'Лейтенант', 'Капитан', 'Майор', 'Подполковник'] },
  { organization: 'Воинская часть', emoji: '🎖️', positions: ['Рядовой', 'Ефрейтор', 'Мл. сержант', 'Сержант', 'Ст. сержант', 'Старшина', 'Прапорщик', 'Мл. лейтенант', 'Лейтенант'] }
];
