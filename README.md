# Работяга

Telegram Mini App для управления сменами в баре — задачи, расписание, дисциплина, аналитика.

Разрабатывается в сторону внешнего SaaS-продукта для HoReCa.

---

## Возможности

- **Смены** — расписание на месяц, статусы сотрудников, контроль нормы штата, ручные переопределения (отпуск, больничный)
- **Задачи** — открытие/закрытие/ежедневные/будние/еженедельные/разовые/нерегулярный бэклог; перенос невыполненных
- **Дисциплина** — жёлтые / оранжевые / красные карточки с историей и прогрессией
- **Аналитика** — процент выполнения задач, выручка план/факт, личные тренды, рекомендации
- **Личный кабинет** — статистика за 14 и 30 дней, активные карточки, предстоящие смены, советы
- **Telegram-пуши** — напоминание за день до смены (20:00), личные задачи (09:00), закрытие смены (22:00)
- **Гоу-лист** — общий список дел смены, редактируется всеми
- **Передача смены** — перенос невыполненного на следующий день с заметками
- **Команда** — управление составом, выдача карточек, статистика, сброс паролей
- **Тёмная/светлая/авто-тема** — следует системным настройкам устройства

## Стек

| Слой | Технологии |
|---|---|
| Frontend | React 19, Vite 6, Lucide React |
| Backend | Express 5, Telegraf 4 |
| Хранилище | KV flat-file (`data.json`), дебаунс-flush |
| Auth | JWT (httpOnly cookie), bcrypt, rate limiting |
| Деплой | Docker + Caddy, Timeweb Cloud |

## Роли

| Роль | Доступ |
|---|---|
| **Бармен** | Свои задачи, расписание, личная статистика |
| **Шеф-бармен** | + все задачи смены, создание задач, статистика команды |
| **Управляющий** | Полный доступ, управление командой и расписанием |
| **Разработчик** | Суперадмин + системные настройки (ACL, шаблоны пушей) |

## Быстрый старт

```bash
# 1. Бэкенд (порт 3001)
cd rabotyaga-bot
cp .env.example .env        # TELEGRAM_TOKEN + JWT_SECRET (openssl rand -hex 32)
npm install && npm start

# 2. Фронтенд (порт 5173, прокси → :3001)
cd frontend
npm install && npm run dev
```

Для тестирования Telegram Mini App нужен туннель (ngrok) и бот с настроенным menu button URL.

## Деплой

Продакшн: **rabotyaga55.ru** — Timeweb Cloud, Docker, Caddy.

```bash
./deploy.sh   # build frontend → обновить Docker-образ → рестартовать контейнер
```

## Структура

```
rabotyaga/
├── frontend/src/
│   ├── pages/          # TodayTab, TasksTab, ScheduleTab, TeamHubTab, PersonalCabinet, LogsTab
│   ├── modals/         # AuthModal, TaskModal, CardModal, HandoverModal, InboxModal, ClosingSummaryModal
│   ├── components/     # Переиспользуемые компоненты
│   ├── utils/          # Бизнес-логика: задачи, статусы, карточки, статистика
│   └── services/api.js # HTTP-клиент (cookie-auth, KV CRUD, push API)
└── rabotyaga-bot/
    ├── server.js        # Express API + Telegraf bot
    └── src/
        ├── api/         # auth, push, admin, iiko, dataSources
        ├── push/        # scheduler.js, sender.js
        └── middleware/  # JWT auth
```

## Документация

- [Руководство пользователя](docs/user-guide.md)
- [Планы разработки](docs/plans/)
- [.env.example](rabotyaga-bot/.env.example)
