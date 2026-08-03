# OpenAlex PDF Feed

Standalone-инструмент, отдельный от FastAPI-приложения и Postgres этого
репозитория. Раз в неделю ищет новые Open Access PDF-статьи по кураторскому
словарю точных фраз (`terms.yaml`) через OpenAlex API и складывает их в
Cloudflare R2. Личный сайд-проект — администрируется вручную, не часть
продукта.

## Как это работает

1. `.github/workflows/openalex-pdf-feed.yml` раз в неделю (пн 06:00 UTC, либо
   вручную через workflow_dispatch) запускает `python -m openalex_pdf_feed.run`.
2. Для каждой фразы в `terms.yaml` — discovery по OpenAlex (`open_access.is_oa:true`,
   `has_content.pdf:true`, точная фраза в `title_and_abstract.search`).
3. Уже скачанные работы пропускаются (HEAD-проверка `papers/<id>.pdf` в самом
   R2-бакете — бакет одновременно хранилище и dedup-состояние).
4. Новые — скачиваются через content-download эндпоинт OpenAlex ($0.01/файл)
   и кладутся в `papers/<id>.pdf` + `papers/<id>.json` (метаданные).
5. `zotero/library.json` (CSL-JSON) пересобирается целиком из всех
   `papers/*.json` — импортируется в Zotero вручную (File → Import), когда
   удобно.
6. Курсор (`_state/cursor.json`) двигается вперёд после каждого успешного
   прогона — со следующего раза ищутся только статьи новее этой даты.

## Добавить/изменить фразы поиска

Редактировать `terms.yaml` — плоский список строк, без кавычек (квотирование
делает код сам). **Обязательно** формулировать как точную фразу, а не набор
слов: без кавычек OpenAlex делает нестрогий стемминг-матч и даёт кратное
шумовое раздутие нерелевантными результатами (проверено: `existential
analysis` без кавычек — 18271 совпадение, с кавычками — 433). Изменения
подхватятся на следующем плановом прогоне.

## Переменные окружения / секреты

| Переменная | Назначение |
|---|---|
| `OPENALEX_API_KEY` | бесплатный ключ, openalex.org/settings/api |
| `R2_BUCKET` | имя бакета (`openalex-pdf-feed`) |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 Account API token, **Object Read & Write**, scope только на этот бакет |

В GitHub Actions — Settings → Secrets and variables → Actions этого репо.
Локально — `.env` в корне репозитория (те же имена).

## Локальный запуск

```bash
export $(grep -v '^#' .env | xargs)  # если секреты лежат в .env
python -m openalex_pdf_feed.run
```

Тесты: `uv run pytest openalex_pdf_feed/tests` (не входит в общий
`ruff check app tests` / `mypy app` / coverage-гейт — тот же прецедент, что
`db_seeder/`).

## Синхронизация R2 → iCloud Drive на Mac

У стороннего сервера нет публичного API для прямой записи в iCloud Drive —
вместо пуша из CI на самом Mac разворачивается `rclone sync` (R2 — нативный
S3-совместимый remote), запускаемый локальным `launchd` раз в сутки. Настройка
— один раз, дальше работает без какого-либо участия пользователя Mac.

**1. Установить rclone** (если не установлен): `brew install rclone`, либо
https://rclone.org/downloads/.

**2. Настроить remote** — `~/.config/rclone/rclone.conf`:

```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = <R2 Account API token — Object Read only, scope на этот бакет>
secret_access_key = <тот же токен, Secret Access Key>
endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
acl = private
```

Токен для этого remote — **отдельный от CI**, только на чтение (Object Read
only). Учётные данные на самом Mac не должны иметь возможности писать/удалять
в бакете.

**3. Скрипт синхронизации** — сохранить, например, как
`~/openalex-pdf-feed-sync.sh` (заменить путь к rclone, если `which rclone`
показывает не `/opt/homebrew/bin/rclone` — на Intel Mac обычно
`/usr/local/bin/rclone`):

```bash
#!/bin/bash
RCLONE=$(command -v rclone)
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/OpenAlex Articles"
"$RCLONE" sync r2:openalex-pdf-feed/papers "$DEST/papers" --create-empty-src-dirs
"$RCLONE" sync r2:openalex-pdf-feed/zotero "$DEST/zotero" --create-empty-src-dirs
```

`chmod +x ~/openalex-pdf-feed-sync.sh`. Синкается только `papers/` и
`zotero/` — `_state/` (курсор) наружу не отдаётся, он внутренний.
`rclone sync` — зеркало: если файл когда-либо удалить из R2, он исчезнет и
локально (ожидаемое поведение, не баг).

**4. launchd-задача** — `~/Library/LaunchAgents/com.openalex-pdf-feed.sync.plist`
(заменить `/Users/<USERNAME>` на реальный путь):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openalex-pdf-feed.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/<USERNAME>/openalex-pdf-feed-sync.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>86400</integer>
    <key>StandardOutPath</key>
    <string>/tmp/openalex-pdf-feed-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/openalex-pdf-feed-sync.err</string>
</dict>
</plist>
```

Загрузить: `launchctl load ~/Library/LaunchAgents/com.openalex-pdf-feed.sync.plist`.
С этого момента статьи появляются в
`iCloud Drive/OpenAlex Articles/papers` сами — раз в сутки, без действий с её
стороны. Проверить вручную в любой момент: `~/openalex-pdf-feed-sync.sh`.

## Импорт в Zotero

Zotero → File → Import → выбрать
`iCloud Drive/OpenAlex Articles/zotero/library.json` → Import as new
collection. Повторный импорт при обновлении файла — обычное действие
пользователя приложения, автоматизация вне скоупа MVP.

## Вне скоупа (см. полное ТЗ в истории разработки)

- CORE.ac.uk fallback для работ без кэша PDF в OpenAlex (~35-45% совпадений,
  считаются в логе прогона, не скачиваются).
- Автоматический импорт в Zotero (Zotero local HTTP API).
- UI/поиск по коллекции — только файлы в папке.
