// lib/staff/owner.ts — Faza 1 staff-access.
// Kanoniczny "workspace owner" = uid Vadyma (da368856…). WSZYSTKIE rekordy
// w 16 owner-based tabelach (istniejące i nowe) należą do niego, niezależnie
// od tego, kto je fizycznie tworzy (Vadym czy pracownik). Dzięki temu Vadym
// i staff operują na TYM SAMYM zbiorze wierszy (parytet widoczności/edycji),
// a zachowanie Vadyma jest niezmienione (jego user.id == ta stała).
//
// Uwaga: to NIE jest sekret — to publiczny identyfikator właściciela danych.
// Trzymany jako stała (nie env), bo jest de-facto ownerem całej bazy już dziś
// i nie może się "rozjechać" między środowiskami.

export const WORKSPACE_OWNER_ID = 'da368856-bc33-42b2-adc4-625d66a43e6f'
