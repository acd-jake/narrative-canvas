# Narrative Canvas

![GitHub Release](https://img.shields.io/github/v/release/acd-jake/narrative-canvas?display_name=tag&style=for-the-badge&label=Latest%20Release)

![Latest Release Download Count](https://img.shields.io/github/downloads/acd-jake/narrative-canvas/latest/module.zip?color=2b82fc&label=LATEST%20VERSION%20DOWNLOADS&style=for-the-badge)

![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Facd-jake%2Fnarrative-canvas%2Frefs%2Fheads%2Fmain%2Fmodule.json&label=Foundry%20Version&query=$.compatibility.verified&colorB=orange&style=for-the-badge)

[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fnarrative-canvas&colorB=006400&style=for-the-badge)](https://forge-vtt.com/bazaar#package=narrative-canvas)

[![Foundry Hub Endorsements](https://img.shields.io/endpoint?logoColor=white&url=https%3A%2F%2Fwww.foundryvtt-hub.com%2Fwp-json%2Fhubapi%2Fv1%2Fpackage%2Fnarrative-canvas%2Fshield%2Fendorsements&style=for-the-badge)](https://www.foundryvtt-hub.com/package/narrative-canvas/)

![GitHub all releases](https://img.shields.io/github/downloads/acd-jake/narrative-canvas/total?label=TOTAL%20DOWNLOADS&style=for-the-badge)

Narrative Canvas adds a Theatre of the Mind presentation stage to Foundry Virtual Tabletop. Game Masters can prepare reusable narrative scenes and present backgrounds, handout images, actors, and synchronized audio without changing the active Foundry scene.

## Features

- Reusable scenes with backgrounds, handout images, actors, and audio tracks.
- A GM Scene Configurator that can float freely or dock beside a Journal Entry, with a shelf of assets referenced by that journal.
- A Director interface for preparing a presentation privately and publishing it to players when ready.
- A visual-novel-style actor display with speaker highlighting and configurable nameplates.
- Director controls to clear all staged actors, hide the Visual Novel overlay from players while keeping a dimmed GM preview, and reorder actors by dragging them on the stage.
- Drag to reorder scenes, background and handout images, actors, and audio entries in the Scene Configurator. Playlist entries move as a group.
- Multiple handout image overlays that the GM can move, resize, and close independently.
- Selectable themes (Fantasy, Dark Fantasy, Science Fiction, Noir, Cyberpunk, Cosmic Horror, Western, Art Deco) for subtitles, handout images, and actors. Set the default in the module settings or switch temporarily from the Director toolbar. Additional themes are added as directories under `themes/` with a `theme.json` and their images, registered in `module.json`.
- Journal browsing and the ability to show journal images on the presentation stage.
- A dialogue system for the Visual Novel overlay, toggled from the Director toolbar. The GM picks the speaker (or the narrator when no actor is the active speaker) and sends lines that appear in the theme's subtitle look: actor lines fade in character by character with the speaker's name on the top edge, narrator lines fade in line by line at a reading speed without a name. Long text is height-limited and scrolls automatically. A click on a line fades it out early for everyone.
- Dialogue speed is a multiplier (×0.5 to ×5) in the input area, saved per user and applied to the running line immediately. Reveal mode (character, line or paragraph, separately for dialogue and narrator text), text sizes, reading and scroll speed, and the hold time of dialogue and narrator lines are configurable in the module settings. Only one line is shown at a time. The active speaker is shown larger and their highlight pulses while a line is displayed.
- Narrator lines are shown vertically centered while they are revealed; short texts stay centered, longer texts end at the bottom of the narrator bar.
- Optional **Talking Actors** integration reads lines aloud (`/talk`, or `/narrate` for the narrator) while the canvas is released to the players; a leading `(stage direction)` is passed to Talking Actors and not displayed, and the Journal Viewer can transfer a direction in parentheses before direct speech together with the text. The Live badge shows whether lines would currently be read aloud, and a setting controls whether they also appear in the chat.
- Optional **Polyglot** integration to pick the language of a line; players who do not know it see scrambled text.
- Text selections and read-aloud sections of journals (for example `keeper-read-aloud` in Call of Cthulhu 7e or `narrative` in Pathfinder 2e; configurable in the module settings) can be sent to the dialogue input.
- Read-aloud sections can be sent directly to the narrator line with an extra button or the context menu, and are additionally spoken with `/narrate` when voice output is active.
- A character sheet dock: moving the mouse to the bottom edge of the left third of the canvas slides in the tokens of player characters (all for the GM, only owned ones for players). Clicking a token opens or closes that character's sheet centered above the canvas; only one sheet is open at a time. The dock hides 2 seconds after the pointer leaves and stays visible while a sheet is open, with the matching token highlighted.
- Automatic background and audio playback when a scene is activated or the Canvas is reopened with an active scene.
- Scenes can automatically start one PlaylistSound or an entire playlist. Starting a scene track or playlist stops other active scene audio.
- Scene audio uses existing Foundry Playlist and PlaylistSound documents. Foundry synchronizes playlist and individual-track playback with connected players.
- Players can adjust or mute scene audio locally without changing other clients' volume.
- Journal Viewer controls let each user pick a journal page from a dropdown and adjust the page text size for readability.
- Direct speech in journals is detected across line breaks and up to a configurable number of consecutive paragraphs (default 3).
- Configurable logging levels help GMs diagnose module issues.
- Player controls to dismiss the Canvas locally and reopen it while the GM's presentation remains published.
- English and German interface translations.

## Requirements

- Foundry Virtual Tabletop 14 or later within the module's supported version range.
- No specific game system is required.
- Optional: [ACD Talking Actors](https://github.com/acd-jake/acd-talking-actors) to read dialogue lines aloud and [Polyglot](https://foundryvtt.com/packages/polyglot) for dialogue languages. Without them, only the corresponding dialogue controls are missing.

## Architecture

Runtime responsibilities are separated by role:

- `scripts/services/manager.js` coordinates presentation state and lifecycle.
- `scripts/services/active-state-store.js` persists and restores the active presentation state.
- `scripts/services/director-actions.js` maps Director actions to state and scene operations.
- `scripts/services/scene-asset-resolver.js` resolves Foundry drag data into scene asset operations.
- `scripts/services/scene-repository.js` owns scene data access and mutation; reads normalize a copy of the stored data.
- `scripts/services/settings-layout.js` groups the module settings into sections in the settings window.
- `scripts/ui/dialogue-line.js` displays dialogue and narrator lines on the stage, including reveal animation and autoscroll.
- `scripts/ui/journal-selection-menu.js` sends selected journal text and read-aloud sections to the dialogue input.
- `scripts/ui/character-sheet-dock.js` provides the hover dock with character tokens that toggle character sheets.

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

Download `module.zip` from the [latest GitHub release](https://github.com/acd-jake/narrative-canvas/releases) and extract it into Foundry's `Data/modules` directory. Make sure the `narrative-canvas` folder contains `module.json` at its root. The release archive includes the built-in theme definitions and frame artwork, and the changelog. Then enable the module in **Manage Modules** and reload your world.

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
- Regie-Steuerungen, um alle Bühnenakteure zu entfernen, das VisualNovel-Overlay für Spielende auszublenden und es für die Spielleitung abgedimmt vorzubereiten sowie Akteure direkt auf der Bühne per Drag-and-drop umzusortieren.
- Szenen, Hintergrund- und Handout-Bilder, Akteure sowie Audioeinträge lassen sich im Szeneneditor per Drag-and-drop sortieren. Playlist-Einträge werden als Gruppe verschoben.
- Mehrere Handout-Bildüberlagerungen, die unabhängig voneinander verschoben, skaliert und geschlossen werden können.
- Auswählbare Themes (Fantasy, Dark Fantasy, Science Fiction, Noir, Cyberpunk, Kosmischer Horror, Western, Art Déco) für Untertitel, Handout-Bilder und Akteure. Das Standard-Theme wird in den Moduleinstellungen festgelegt und lässt sich über die Regie-Werkzeugleiste temporär umschalten. Weitere Themes entstehen als Verzeichnis unter `themes/` mit einer `theme.json` und den Bilddateien und werden in `module.json` eingetragen.
- Journal-Navigation und die Möglichkeit, Journal-Bilder direkt auf der Präsentationsfläche anzuzeigen.
- Ein Dialogsystem für das VisualNovel-Overlay, das über die Regie-Werkzeugleiste ein- und ausgeschaltet wird. Die Spielleitung wählt den Sprecher (oder den Erzähler, wenn kein Akteur aktiver Sprecher ist) und sendet Zeilen im Untertitel-Look des Themes: Akteurzeilen blenden zeichenweise ein und zeigen den Sprechernamen am oberen Rand, Erzählerzeilen blenden zeilenweise in angenehmer Lesegeschwindigkeit und ohne Namen ein. Langer Text ist in der Höhe begrenzt und scrollt automatisch. Ein Klick auf eine Zeile blendet sie vorzeitig für alle aus.
- Die Dialoggeschwindigkeit ist im Eingabebereich als Multiplikator (×0,5 bis ×5) einstellbar, wird pro Nutzer gespeichert und wirkt sofort auch auf die laufende Zeile. Die Einblendung (zeichen-, zeilen- oder absatzweise, getrennt für Dialog- und Erzählertext), Textgrößen, Lese- und Scrollgeschwindigkeit sowie die Standzeit der Dialog- und Erzählerzeilen sind in den Moduleinstellungen konfigurierbar. Es wird immer nur eine Zeile gleichzeitig angezeigt. Der aktive Sprecher wird größer dargestellt, und sein Glow pulsiert, solange eine Zeile angezeigt wird.
- Erz\u00e4hlerzeilen werden beim Einblenden vertikal zentriert angezeigt; kurze Texte bleiben zentriert, l\u00e4ngere enden am unteren Rand der Erz\u00e4hlleiste.
- Optionale Anbindung an **Talking Actors**: Zeilen werden vorgelesen (`/talk`, für den Erzähler `/narrate`), solange der Canvas für die Spielenden freigegeben ist. Eine führende `(Regieanweisung)` wird an Talking Actors übergeben und nicht angezeigt; der Journalviewer kann eine Anweisung in Klammern vor wörtlicher Rede samt Text übernehmen. Das Live-Badge zeigt, ob gerade vorgelesen würde, und eine Einstellung legt fest, ob die Zeilen zusätzlich im Chat erscheinen.
- Optionale Anbindung an **Polyglot** zur Wahl der Sprache einer Zeile; Spielende, die sie nicht beherrschen, sehen verschleierten Text.
- Textauswahlen und Vorlesetexte aus Journalen (zum Beispiel `keeper-read-aloud` bei Call of Cthulhu 7e oder `narrative` bei Pathfinder 2e; in den Moduleinstellungen konfigurierbar) lassen sich in die Eingabezeile übernehmen.
- Vorlesetexte lassen sich über eine zusätzliche Schaltfläche oder das Kontextmenü direkt in die Erzählzeile senden, bei aktiver Sprachausgabe zusätzlich mit `/narrate` an Talking Actors.
- Eine Charakterbogen-Leiste: Bewegt man die Maus an den unteren Rand des linken Canvas-Drittels, gleiten die Token der Spielercharaktere ins Bild (für die Spielleitung alle, für Spielende nur die eigenen). Ein Klick auf ein Token öffnet bzw. schließt den Charakterbogen zentriert über dem Canvas; es ist immer nur ein Bogen offen. Die Leiste blendet sich 2 Sekunden nach dem Verlassen des Bereichs aus und bleibt sichtbar, solange ein Bogen offen ist; das passende Token ist hervorgehoben.
- Automatische Wiedergabe von Hintergründen und Audio beim Aktivieren einer Szene oder beim erneuten Öffnen des Canvas mit aktiver Szene.
- Szenen können einen einzelnen PlaylistSound oder eine ganze Playlist automatisch starten. Beim Starten eines Szenen-Tracks oder einer Playlist wird anderes aktives Szenen-Audio gestoppt.
- Synchronisierte Wiedergabe einzelner Audiospuren einschließlich Lautstärke, Stummschaltung, Pause und Stopp. Auch Spielende, die während einer laufenden Spur beitreten, erhalten deren Wiedergabe. Foundry-Playlists verwenden die native Synchronisierung von Foundry.
- Spielende können die Szenenlautstärke lokal anpassen oder stummschalten, ohne die Lautstärke anderer Clients zu verändern.
- Die Journal-Seitenansicht bietet eine Auswahlliste für die Seiten und eine individuell einstellbare Schriftgröße für bessere Lesbarkeit.
- Wörtliche Rede in Journalen wird über Zeilenumbrüche und bis zu einer einstellbaren Zahl zusammenhängender Absätze (Standard 3) erkannt.
- Konfigurierbare Log-Level helfen der Spielleitung bei der Fehlersuche im Modul.
- Spielende können die Canvas-Ansicht lokal schließen und wieder öffnen, solange die Präsentation der Spielleitung veröffentlicht ist.
- Englische und deutsche Oberflächenübersetzungen.

## Voraussetzungen

- Foundry Virtual Tabletop 14 oder eine neuere Version innerhalb des vom Modul unterstützten Versionsbereichs.
- Es ist kein bestimmtes Spielsystem erforderlich.
- Optional: [ACD Talking Actors](https://github.com/acd-jake/acd-talking-actors) zum Vorlesen von Dialogzeilen und [Polyglot](https://foundryvtt.com/packages/polyglot) für Dialogsprachen. Ohne sie fehlen nur die jeweiligen Bedienelemente des Dialogsystems.

## Architektur

Die Laufzeitverantwortlichkeiten sind nach Aufgaben getrennt:

- `scripts/services/manager.js` koordiniert Präsentationszustand und Lebenszyklus.
- `scripts/services/active-state-store.js` speichert und rekonstruiert den aktiven Präsentationszustand.
- `scripts/services/director-actions.js` ordnet Regieaktionen Zustands- und Szenenoperationen zu.
- `scripts/services/scene-asset-resolver.js` löst Foundry-Drag-Daten in Szenen-Asset-Aktionen auf.
- `scripts/services/scene-repository.js` verwaltet den Szenendatenzugriff und Änderungen; beim Lesen wird eine Kopie der gespeicherten Daten normalisiert.
- `scripts/services/settings-layout.js` gliedert die Moduleinstellungen im Einstellungsfenster in Abschnitte.
- `scripts/ui/dialogue-line.js` zeigt Dialog- und Erzählerzeilen auf der Bühne an, einschließlich Einblendanimation und Autoscroll.
- `scripts/ui/journal-selection-menu.js` übergibt markierten Journaltext und Vorlesetexte an die Dialog-Eingabezeile.
- `scripts/ui/character-sheet-dock.js` stellt die Hover-Leiste mit Charakter-Token bereit, die Charakterbögen öffnen und schließen.

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

Lade `module.zip` aus dem [neuesten GitHub-Release](https://github.com/acd-jake/narrative-canvas/releases) herunter und entpacke die Datei in Foundrys Verzeichnis `Data/modules`. Der Ordner `narrative-canvas` muss die Datei `module.json` direkt im Stammverzeichnis enthalten. Das Release-Archiv enthält auch die mitgelieferten Theme-Definitionen und Rahmenbilder sowie das Changelog. Aktiviere danach das Modul unter **Manage Modules** und lade die Welt neu.

## Weitere Informationen

Im [Narrative-Canvas-Wiki](https://github.com/acd-jake/narrative-canvas/wiki) findest du ausführliche Informationen zu Konfiguration, Szenenvorbereitung, Regieansicht, Abläufen für die Spielleitung und zur Ansicht der Spielenden.

## Mitwirkende und Danksagungen

Narrative Canvas wird von [Acd-Jake](https://github.com/acd-jake) entwickelt und gepflegt. Das Modul ist ein Add-on für [Foundry Virtual Tabletop](https://foundryvtt.com/).
