# Audit-log — 30.05.2026 — Тиждень 2 закрито (7/7)

## Стан

HEAD на момент запису: 67b5d35

Тиждень 2 завершено повністю — всі 7 пунктів T2.1–T2.7 у проді, перевірені живим через браузер.

## Що закрито сьогодні (30.05)

### T2.7 — edit form, прибрано дрейф notes (commit 3085518)

- Форма клієнта писала legacy clients.notes, а display читає client_notes (T2.5) → дрейф.
- Прибрано поле Notatki з форми повністю (formData, NIP lookup, Textarea, import).
- Рішення: варіант 1 — нотатки живуть тільки в T2.5 inline секції. clients.notes колонка лишилась для back-compat, не чіпали.
- Auto-prefill решти полів уже працював (форма читає client row) — нічого не додавали.
- tsc baseline 24, без регресу.

### T2.6 — історія взаємодій / timeline (commit 2d861d1 + fix 67b5d35)

- Рішення: варіант C — розширили client_notes замість нової таблиці.
- Міграція 077: ADD COLUMN kind TEXT DEFAULT 'note' + occurred_at TIMESTAMPTZ (NULL = беремо created_at).
- 4 типи: note / call / meeting / order_followup (UI: Notatka / Telefon / Spotkanie / Przypomnienie o zamówieniu).
- Timeline зливає orders (4 події per row: created/opened/submitted/confirmed) + client_notes (з kind). Сортування DESC за COALESCE(occurred_at, created_at).
- notification_log НЕ включено (шум).
- Нова секція id="historia" вставлена ВИСОКО — одразу після Profil.
- Файли: scripts/077_client_notes_timeline.sql, lib/timeline/build-events.ts, components/clients/client-timeline-section.tsx, app/actions/client-notes.ts, app/(dashboard)/clients/[id]/page.tsx.

## Перевірено живим у проді (Chrome MCP)

- Continental Group PL + Imperial: стара нотатка T2.5 влилась у timeline як kind='note' з датою 24.04.2026.
- PIKNIKO: замовлення ZIO-2026-0009 розклалось на 3 події timeline (created 14:33 → opened 14:34 → submitted 14:35), відсортовані DESC.
- Форма Dodaj wpis: 4 типи + datetime-local (occurred_at) + textarea 0/5000 + Anuluj/Zapisz. Усе польською.

## Урок (новий технічний)

- styled-jsx + Turbopack: tsc НЕ ловить помилки CSS-селекторів усередині <style jsx>. Build на Vercel впав (UnexpectedTokenInAttributeSelector на :global(.bg-\[\#E5E1D8\])) при чистому tsc=24.
- Висновок: для компонентів зі styled-jsx перевіряти повним `pnpm run build`, не лише tsc. Краще взагалі не вживати styled-jsx — решта Sztab на Tailwind. Фікс: прибрали styled-jsx, лінію-зв'язок timeline робимо через isLast prop.

## Backlog (не зроблено, свідомо відкладено)

- 71 whitespace-only записів у legacy clients.notes — лишені як є.
- Можлива доміграція legacy clients.notes → client_notes (перевірити чи seed щось загубив) — окремо, якщо знадобиться.
- 24 tsc baseline помилки (SupabaseClient типи у scripts/) — cleanup колись.
