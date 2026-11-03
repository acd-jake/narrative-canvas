# Narrative Canvas

Narrative Canvas adds a Theatre of the Mind presentation stage to Foundry Virtual Tabletop. Game Masters can prepare reusable narrative scenes and present backgrounds, handout images, actors, and synchronized audio without changing the active Foundry scene.

## Features

- Reusable scenes with backgrounds, handout images, actors, and audio tracks.
- A GM Scene Configurator that can float freely or dock beside a Journal Entry, with a shelf of assets referenced by that journal.
- A Director interface for preparing a presentation privately and publishing it to players when ready.
- A visual-novel-style actor display with speaker highlighting and configurable nameplates.
- Multiple handout image overlays that the GM can move, resize, and close independently.
- Selectable themes (Fantasy, Dark Fantasy, Science Fiction, Noir) for subtitles, handout images, and actors. Set the default in the module settings or switch temporarily from the Director toolbar. Additional themes are added as directories under `themes/` with a `theme.json` and their images, registered in `module.json`.
- Journal browsing and the ability to show journal images on the presentation stage.
- Automatic background and audio playback when a scene is activated or the Canvas is reopened with an active scene.
- Scenes can automatically start one PlaylistSound or an entire playlist. Starting a scene track or playlist stops other active scene audio.
- Scene audio uses existing Foundry Playlist and PlaylistSound documents. Foundry synchronizes playlist and individual-track playback with connected players.
- Players can adjust or mute scene audio locally without changing other clients' volume.
- Journal Viewer controls let each user adjust journal page text size for readability.
- Configurable logging levels help GMs diagnose module issues.
- Player controls to dismiss the Canvas locally and reopen it while the GM's presentation remains published.
- English and German interface translations.

## Requirements

- Foundry Virtual Tabletop 14 or later within the module's supported version range.
- No specific game system is required.

## Architecture

Runtime responsibilities are separated by role:

- `scripts/services/manager.js` coordinates presentation state and lifecycle.
- `scripts/services/active-state-store.js` persists and restores the active presentation state.
- `scripts/services/director-actions.js` maps Director actions to state and scene operations.
- `scripts/services/scene-asset-resolver.js` resolves Foundry drag data into scene asset operations.
- `scripts/services/scene-repository.js` owns scene data access and mutation; reads normalize a copy of the stored data.

## Development

Automated service tests require Node.js 22.12.0 or newer. From the module directory, run:

```sh
npm ci
npm test
```

Use `npm run test:watch` while developing tests.

## Installation

### Install through Foundry

In Foundry Setup, open **Add-on Modules** and select **Install Module**. Search for **Narrative Canvas**, or install it using the latest-release manifest:

`https://github.com/acd-jake/narrative-canvas/releases/latest/download/module.json`

After installation, open your world, go to **Manage Modules**, enable **Narrative Canvas**, and reload if prompted.

### Manual installation

Download `module.zip` from the [latest GitHub release](https://github.com/acd-jake/narrative-canvas/releases) and extract it into Foundry's `Data/modules` directory. Make sure the `narrative-canvas` folder contains `module.json` at its root. The release archive includes the built-in theme definitions and frame artwork. Then enable the module in **Manage Modules** and reload your world.

## Learn More

See the [Narrative Canvas Wiki](https://github.com/acd-jake/narrative-canvas/wiki) for configuration guidance, scene preparation, Director Controls, GM workflows, and the player experience.

## Credits

Narrative Canvas is created and maintained by [Acd-Jake](https://github.com/acd-jake). It is built as an add-on module for [Foundry Virtual Tabletop](https://foundryvtt.com/).

## Deutsche Fassung

Narrative Canvas erweitert Foundry Virtual Tabletop um eine Präsentationsfläche für Theatre-of-the-Mind-Szenen. Spielleitungen können wiederverwendbare Szenen vorbereiten und Hintergründe, Handout-Bilder, Akteure und synchronisierte Audiospuren präsentieren, ohne die aktive Foundry-Szene zu wechseln.

## Funktionen

- Wiederverwendbare Szenen mit Hintergründen, Handout-Bildern, Akteuren und Audiospuren.
- Ein Szeneneditor für die Spielleitung, der frei platziert oder neben einem Journaleintrag angedockt werden kann. Eine Ablage zeigt die im jeweiligen Journal referenzierten Akteure und Bilder.
- Eine Regieansicht, in der Präsentationen zunächst privat vorbereitet und anschließend für die Spielenden veröffentlicht werden können.
- Eine Visual-Novel-artige Akteursanzeige mit Hervorhebung der sprechenden Figur und einstellbaren Namensschildern.
- Mehrere Handout-Bildüberlagerungen, die unabhängig voneinander verschoben, skaliert und geschlossen werden können.
- Auswählbare Themes (Fantasy, Dark Fantasy, Science Fiction, Noir) für Untertitel, Handout-Bilder und Akteure. Das Standard-Theme wird in den Moduleinstellungen festgelegt und lässt sich über die Regie-Werkzeugleiste temporär umschalten. Weitere Themes entstehen als Verzeichnis unter `themes/` mit einer `theme.json` und den Bilddateien und werden in `module.json` eingetragen.
- Journal-Navigation und die Möglichkeit, Journal-Bilder direkt auf der Präsentationsfläche anzuzeigen.
- Automatische Wiedergabe von Hintergründen und Audio beim Aktivieren einer Szene oder beim erneuten Öffnen des Canvas mit aktiver Szene.
- Szenen können einen einzelnen PlaylistSound oder eine ganze Playlist automatisch starten. Beim Starten eines Szenen-Tracks oder einer Playlist wird anderes aktives Szenen-Audio gestoppt.
- Synchronisierte Wiedergabe einzelner Audiospuren einschließlich Lautstärke, Stummschaltung, Pause und Stopp. Auch Spielende, die während einer laufenden Spur beitreten, erhalten deren Wiedergabe. Foundry-Playlists verwenden die native Synchronisierung von Foundry.
- Spielende können die Szenenlautstärke lokal anpassen oder stummschalten, ohne die Lautstärke anderer Clients zu verändern.
- Die Schriftgröße der Journal-Seitenansicht lässt sich für bessere Lesbarkeit individuell einstellen.
- Konfigurierbare Log-Level helfen der Spielleitung bei der Fehlersuche im Modul.
- Spielende können die Canvas-Ansicht lokal schließen und wieder öffnen, solange die Präsentation der Spielleitung veröffentlicht ist.
- Englische und deutsche Oberflächenübersetzungen.

## Voraussetzungen

- Foundry Virtual Tabletop 14 oder eine neuere Version innerhalb des vom Modul unterstützten Versionsbereichs.
- Es ist kein bestimmtes Spielsystem erforderlich.

## Architektur

Die Laufzeitverantwortlichkeiten sind nach Aufgaben getrennt:

- `scripts/services/manager.js` koordiniert Präsentationszustand und Lebenszyklus.
- `scripts/services/active-state-store.js` speichert und rekonstruiert den aktiven Präsentationszustand.
- `scripts/services/director-actions.js` ordnet Regieaktionen Zustands- und Szenenoperationen zu.
- `scripts/services/scene-asset-resolver.js` löst Foundry-Drag-Daten in Szenen-Asset-Aktionen auf.
- `scripts/services/scene-repository.js` verwaltet den Szenendatenzugriff und Änderungen; beim Lesen wird eine Kopie der gespeicherten Daten normalisiert.

## Entwicklung

Die automatisierten Service-Tests benötigen Node.js 22.12.0 oder neuer. Führe im Modulverzeichnis Folgendes aus:

```sh
npm ci
npm test
```

Während der Testentwicklung kann `npm run test:watch` verwendet werden.

## Installation

### Installation über Foundry

Öffne in Foundry Setup **Add-on Modules** und wähle **Install Module**. Suche nach **Narrative Canvas** oder installiere das Modul über das Manifest des neuesten Releases:

`https://github.com/acd-jake/narrative-canvas/releases/latest/download/module.json`

Öffne anschließend deine Welt, gehe zu **Manage Modules**, aktiviere **Narrative Canvas** und lade die Welt neu, falls Foundry dazu auffordert.

### Manuelle Installation

Lade `module.zip` aus dem [neuesten GitHub-Release](https://github.com/acd-jake/narrative-canvas/releases) herunter und entpacke die Datei in Foundrys Verzeichnis `Data/modules`. Der Ordner `narrative-canvas` muss die Datei `module.json` direkt im Stammverzeichnis enthalten. Das Release-Archiv enthält auch die mitgelieferten Theme-Definitionen und Rahmenbilder. Aktiviere danach das Modul unter **Manage Modules** und lade die Welt neu.

## Weitere Informationen

Im [Narrative-Canvas-Wiki](https://github.com/acd-jake/narrative-canvas/wiki) findest du ausführliche Informationen zu Konfiguration, Szenenvorbereitung, Regieansicht, Abläufen für die Spielleitung und zur Ansicht der Spielenden.

## Mitwirkende und Danksagungen

Narrative Canvas wird von [Acd-Jake](https://github.com/acd-jake) entwickelt und gepflegt. Das Modul ist ein Add-on für [Foundry Virtual Tabletop](https://foundryvtt.com/).