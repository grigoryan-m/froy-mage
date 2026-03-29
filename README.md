# Фройский Маг — Проект

## Файлы

| Файл | Описание |
|------|----------|
| `index.html` | Лист персонажа |
| `spells.html` | Вики заклинаний |
| `config.js` | **Сюда вставить API ключ и ID таблицы** |
| `sheets.js` | Хелпер Google Sheets API (не трогать) |
| `README.md` | Этот файл |

---

## Настройка Google Sheets

### Шаг 1 — Создай таблицу с тремя листами

| Лист | Заголовки первой строки |
|---|---|
| `spells` | `name \| trauma \| mana \| desc` |
| `class_skills` | `element \| level \| type \| name \| desc \| mana \| requirement` |
| `adj_skills` | `branch \| type \| name \| desc \| mana \| requirement` |

**Лист `spells`** — trauma: `смерть / утрата / унижение / контроль / нападение`

**Лист `class_skills`** — element: `fly / atk / ill / def / ctrl`, level: `1–5`, type: `пассив / актив`
- `mana` — только для активных умений, например `4`. У пассивов оставь пустым.
- `requirement` — только для активных умений, например `Быть выше цели на ≥20 фт`. У пассивов оставь пустым.

**Лист `adj_skills`** — branch: `natisk / obman / pokoj / istsel / gospod / stoikost`, type: `пассив / актив`
- `mana` и `requirement` — так же только для активных умений.

### Шаг 2 — Открой доступ

Поделиться → Все, у кого есть ссылка → Читатель

### Шаг 3 — Получи API ключ

1. [console.cloud.google.com](https://console.cloud.google.com) → Новый проект
2. Поиск: **Google Sheets API** → Включить
3. API и сервисы → Учётные данные → Создать → Ключ API

### Шаг 4 — ID таблицы

Из URL: `https://docs.google.com/spreadsheets/d/**ВОТ_ЭТО**/edit`

### Шаг 5 — Заполни config.js

```javascript
const SHEETS_CONFIG = {
  apiKey:        'AIzaSy...',
  spreadsheetId: '1BxiMVs...',
};
```

---

## Деплой на GitHub Pages

Залей все файлы в репозиторий → Settings → Pages → main branch.

Оба файла (`index.html` и `spells.html`) должны быть **на одном домене** — это нужно для вставки спеллов через localStorage.
