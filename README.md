# Mapa Książki — Android

Aplikacja do zapamiętywania książek bez robienia szkolnych streszczeń.

## Funkcje
- biblioteka książek z okładkami
- mapa książki z krótkimi wpisami:
  - 💡 Myśl
  - 🔥 Zapamiętać
  - 🧠 Przemyślenie
  - ✅ Zastosuję
  - ❓ Pytanie
  - 📸 Zdjęcie strony
- numer strony
- automatyczne podsumowanie po oznaczeniu książki jako przeczytanej
- „Jedna lekcja na dziś” z Twoich starych notatek
- dane zapisywane lokalnie
- stały podpis pod przyszłe aktualizacje

Package ID: pl.reading.mapaksiazki

GitHub Secrets:
- BOOKMAP_KEYSTORE_BASE64
- BOOKMAP_KEYSTORE_PASSWORD

Jeśli `.github` nie wgra się przez stronę GitHuba:
1. Add file -> Create new file
2. Nazwa: `.github/workflows/build-apk.yml`
3. Wklej zawartość `BUILD_APK_YAML.txt`
4. Commit changes
5. Actions -> Build Mapa Książki APK
