# CPR Helper

Kleine Web-App für Rettungssanitäter: Metronom mit 110 BPM und Atmungsanleitung für Reanimation.

## Funktionen

- **Metronom** mit 110 Schlägen pro Minute (Herzfrequenz-Ziel)
- **30:2** – 30 Kompressionen, dann 5 s Pause für 2 Beatmungen
- **15:2** – 15 Kompressionen, dann 5 s Pause für 2 Beatmungen
- **10:1** – 10 Kompressionen, Beatmung bei laufendem Metronom (keine Pause)

## Starten

```bash
npm install
npm run dev
```

Im Browser die angezeigte URL öffnen (z. B. `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

Die fertigen Dateien liegen in `dist/`.

## Android APK

Die fertige APK findest du unter [Releases](https://github.com/leonard-roepcke/cpr-helper-app/releases) zum direkten Download.

**Installation:** APK herunterladen, ggf. „Installation aus unbekannten Quellen“ erlauben, dann installieren.

**Selbst bauen** (Java 21 + Android SDK nötig):

```bash
npm run apk
```
