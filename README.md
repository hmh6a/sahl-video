# Sahl Video | سهل

A free, open-source video editor for Windows and macOS with an Arabic interface. Cut clips, add reusable titles and images, and export at the original resolution or lower without a watermark.

[Download for Windows](https://github.com/hmh6a/sahl-video/releases/latest) · [Report an issue](https://github.com/hmh6a/sahl-video/issues) · [Build status](https://github.com/hmh6a/sahl-video/actions/workflows/windows-release.yml)

## Features

- **Live export list:** **التصديرات** lists running and waiting projects, output filenames, progress and timing. Cancel any export from any project tab, or use **تقديم / تأخير** to reorder waiting jobs. Running exports keep their place.
- **One-click text templates:** **قوالب النص** beside Add text or on the side rail opens a visual gallery with built-in designs and saved layouts. Selecting a design edits the selected title, or creates a title if none is selected, then focuses its text for editing.
- **Multiple projects and an export queue:** open **مشروع جديد +** or **مشروع بتاب جديد +** during export to work in another tab in the same window. The top tab bar keeps each project’s edits, cursor, undo history and export status separate. Its count reflects currently open projects; the last tab stays open without resetting its content. Double-click a tab name (or press F2 on the focused tab) to rename it. Names persist in project saves and autosave recovery. Switching tabs pauses preview playback while exports continue in the background. Use Ctrl+T for a new tab, Ctrl+Tab / Ctrl+Shift+Tab to switch, and Ctrl+W to close the selected tab. Exports run one at a time by default. **إعدادات المعالجة** saves a shared limit of 1–4 simultaneous exports for CPU and GPU combined; choose a limit suitable for your hardware. Waiting exports start automatically and can be canceled independently. Closing a tab with a pending export asks before canceling it. Keep the app open while the queue runs; queued exports are not restored after an app restart.
- **Organized workspace:** larger preview, searchable media library with video/image filters, tabbed text controls, adjustable timeline height, and an in-app shortcut guide. UI numbers use English digits.
- **Simple timeline editing:** split with the scissors tool, delete or reorder clips, scrub through thumbnails, and drag media onto the timeline.
- **Speed and freeze frames:** play a video at 0.25×–4× with optional pitch preservation, or insert a silent hold of the frame at the playhead. Linked sound and titles follow timing changes.
- **Dissolves:** overlap adjacent pictures with an adjustable duration, keep fade-through-black transitions, and choose a smooth audio transition or a cut independently.
- **Visual layers:** overlay up to eight images, transparent logos or videos, with independent timing, fit/crop, position, size, rotation, opacity, ordering, locks and audio. Titles remain above visual layers.
- **Lightweight preview:** generate local 540p/720p proxies in the background, switch each video between original and proxy, cancel generation or clear the bounded cache. Export always reads originals.
- **Independent audio:** import music or recorded commentary into up to eight tracks; trim, move, duplicate, adjust gain/fades, mute or solo tracks, and extract linked video sound. Cached waveforms are generated in the background.
- **Timeline tools:** multiselection, internal copy/paste, duplicate, edge trimming, named markers, snapping, track locks, and gap/ripple audio deletion, with grouped undo.
- **Clip audio:** mute, adjust volume from 0–200%, and set independent audio fades. Playback includes a level meter and a soft ceiling when amplifying; exported audio uses the same gain and ceiling curve.
- **Canvas and framing:** choose source, landscape 16:9, portrait 9:16 or square dimensions, then fit/fill, zoom, move, rotate or flip each clip. Framing works with images and videos, supports undo, and is saved with the project.
- **Titles and templates:** multiple text layers with independent timing and placement, font selection, reusable layouts, and entrance animations. Anton, Noto Sans Arabic and Noto Naskh Arabic are included for offline use; new titles default to Noto Sans Arabic.
- **Images and transitions:** insert images between clips or into a video, set their duration, and add picture and audio fades.
- **Subtitles:** import/export SRT, edit sentence timing, split/merge, select and move multiple cues, snap and trim timeline edges, lock the track, and undo edits. Customize Arabic or mixed-language text and optionally burn it into the video above titles and visual layers.
- **Portable projects:** save edits and their media in one folder, move it to another computer, and continue editing.
- **Recent projects:** reopen the last 20 saved/opened projects with their path, date and a source thumbnail, locate a moved project, or remove only its shortcut.
- **Contextual actions and help:** Enter or Alt+P opens the selected item’s properties; right-click or Shift+F10 opens actions that respect locks. Search the Arabic guide by tool or problem.
- **Recovery:** automatic recovery snapshots every minute, including while exporting, with background copies of videos, images and audio. Unchanged media is reused instead of copied every minute.
- **Faster compositing:** static images and title layers are decoded and resized once, then reused at the original output frame rate. Title processing stops after its visible interval. Resolution, encoder quality and audio settings stay unchanged; background thumbnails pause during export.
- **Export controls:** full-project or frame-aligned range export, source resolution by default, only resolutions smaller than the source (including 8K source projects), source frame rate, supported GPU encoders or CPU encoding, elapsed time, estimated time remaining, and cancellation.
- **Automatic HDR export:** timelines containing PQ or HLG video export as HEVC Main 10 in MP4, preserving HDR and the project resolution/frame rate. The first HDR main clip (or visible HDR layer if the main track is SDR) determines the output transfer; SDR clips, images and sRGB titles are converted into that color space before 10-bit compositing. HEVC hardware support is tested separately; unsupported GPUs fall back to CPU without requiring external conversion. SDR-only projects retain H.264 export. HDR playback requires a compatible player/display. Dynamic Dolby Vision/HDR10+ and source mastering metadata are not carried into the edited montage; this is standard PQ/HLG output, not a Dolby Vision export. Thumbnails use SDR tone mapping for ordinary displays.
- **In-app updates:** automatic checks, a new-version notification, internal downloads with progress and cancellation, checksum verification, and installation with restart. Windows supports direct updates; Mac direct updates require a Developer ID signed release.

## Download and install

1. Open the [latest release](https://github.com/hmh6a/sahl-video/releases/latest).
2. Download `Sahl-Video-<version>.exe` from **Assets**.
3. Run the setup wizard on 64-bit Windows and choose Arabic or English.
4. Choose who to install for and the installation folder, then install. The wizard creates desktop and Start menu shortcuts and an uninstall entry in Windows Settings. Installing for all users or in a protected folder may require administrator permission.

Both Windows and Mac installers include FFmpeg and native FFprobe for their architecture. Users do not need FFmpeg, FFprobe, Homebrew, Node.js or Python installed, and editing/exporting works offline. Uninstalling keeps application data, including recovery snapshots. Saved project folders are independent of the application installation folder.

The interface is in Arabic. Start with **استيراد ملفات**, use the scissors to cut, add titles from **الكتابة**, and choose **تصدير** when ready.

Select a timeline clip and open **القطعة والمشروع** in the properties panel to change its audio or framing. Choose **تحريك الصورة بالسحب في المعاينة** to drag the picture inside the canvas. Canvas resolution is independent of aspect ratio; enlarging the canvas does not add source detail. Audio fades are limited to half the clip duration, and a split preserves fades only at the original outer edges. The level meter measures the combined playback audio, while the controls edit the selected clip.

For macOS, download `Sahl-Video-<version>-mac-arm64.dmg` for Apple Silicon, or `Sahl-Video-<version>-mac-x64.dmg` for Intel. Open the DMG and drag Sahl Video into Applications. These builds currently have no Apple Developer ID certificate or notarization, so macOS may block opening them; they are not presented as signed releases.

Updates are checked at startup and every six hours in supported installed builds. **تحديث الآن** downloads to the application's private cache and installs with a restart; there is no Save As dialog or installer file to open. Unsaved changes go through the existing save/discard/cancel dialog. During an export, import or save, the update waits for **إعادة التشغيل والتحديث**. Closing the app alone never silently installs an update.

Windows updates use NSIS. Mac direct updates use Squirrel.Mac and require a Developer ID signed release. Unsigned Mac builds show an explanation and disable direct updates; install later DMGs manually until signing is configured. Development (`npm start`) also disables updates. Existing versions with the old download-only updater need one final manual installation of a release containing the new updater; subsequent Windows updates install from within the app.

Use **♫** to import music or recorded commentary, then select its timeline piece to open **الصوت**. Audio tracks allow gaps and overlaps; the main picture track remains a contiguous sequence. The export ends with the main picture track and crops any audio beyond that end. Add a video or still before inserting audio. Drag an audio body to move it, its edges to trim it, or use numeric properties; selected audio pieces move together. Move a piece between tracks using its destination selector.

**فصل الصوت** creates a linked audio track and mutes the original selected video pieces. Linked sound follows parent trims, splits, moves and deletion; **فك الربط** makes it independent. Linked audio stays inside its parent interval. Titles can also be bound to a picture clip using the binding selector. Music and titles without links keep their project time. Locked linked tracks block parent edits until unlocked. Track locking protects edits; mute and solo remain usable.

Use Shift-click for a range of picture clips, Ctrl/Cmd-click to toggle individual items, or Shift-drag empty timeline space for marquee selection. Ctrl/Cmd+C, V and D copy, paste and duplicate within the current project, including linked material. **M** creates a named marker (double-click a marker to edit or delete); **N** toggles snapping to the playhead, clip/title/audio edges and markers. Audio deletion offers **إبقاء الفراغ** and **إغلاق الفراغ**; main picture deletion always closes the gap. Clipboard, grouped deletes, reorders and continuous drags each undo in one step. Scroll the timeline vertically or enlarge it with its top divider to see additional tracks. The current limits are 64 picture pieces, 64 audio pieces, 8 audio tracks and 256 markers. Microphone recording is not included.

Select a video piece in **القطعة والمشروع** to set **السرعة ×** (0.25–4). **حافظ على نبرة الصوت** is enabled by default; turn it off to change pitch with speed. Linked sound adopts the new speed, including source trims and waveforms, while unrelated music keeps its project time. Linked titles scale their start offset and duration (minimum 0.1 seconds). Unlinking sound retains its current speed. A speed that makes the video or a linked sound piece shorter than 0.1 seconds is rejected.

Set **مدة الإطار المجمد** and press **أضف تجميد للإطار عند المؤشر**. The editor inserts a silent piece referencing that source frame, then resumes the remaining video; no rendered still file needs to be bundled. Change its duration, trim, split or duplicate it normally. The image keeps the original framing and export color metadata. Holds require a video source and a single-source position outside a dissolve.

Choose **تداخل مباشر** after a piece and set its duration. The actual overlap is limited to half the shorter piece, displayed in the controls, and subtracted from the project duration. **تلاشي للأسود ثم ظهور** retains the full duration and applies the selected fade length on each side. Audio may follow the picture, fade, or cut (at the midpoint of a dissolve). The preview waits for both pictures and their audio before continuing the project clock. Splitting and inserting inside, or too close to, an overlap is rejected when it would silently change its duration; move the playhead or shorten/remove that transition first. Copying a group retains its internal transitions. Transition regions are hatched in the timeline.

Use **＋ طبقة** on a library image or video after adding the main picture track. Select **الطبقات** to set project start, source trim or duration, center position and box size as canvas percentages, rotation, opacity and contain/crop. Drag a selected unlocked layer in the preview or move its chip on the timeline. The top item in the layer list is drawn above the others; all text canvases are above visual layers. Hide removes both picture and sound. Lock prevents editing, deletion and reordering. Video layers start muted; enable their sound and set gain/fades independently. Main/audio solo temporarily silences layer sound. Layers keep absolute project time when the main sequence changes; only the interval inside the main project duration is exported. Active layer decoders are released outside that interval. The layer limit is eight.

Use **معاينة** on a library video to choose the original, 540p or 720p. Press **تجهيز النسخة** when the selected proxy is missing; generation is queued one source at a time with progress and cancellation. Smaller originals are not upscaled. Preview choices are saved, but proxy files stay in the local cache outside portable projects. Missing/evicted proxies fall back to the original and can be regenerated. The cache has a 2 GB limit and removes oldest entries; **مسح كل نسخ المعاينة المؤقتة** removes cached previews without touching source media. Source path, size, modification time and encoding settings identify each proxy. Saving portable media at a new path can require regeneration. Generation is canceled during export while queued jobs wait; canceled jobs can be requested again. HDR proxies are tone mapped to SDR and labeled in the dialog and preview; exports retain the original HDR pipeline. Unsupported browser video codecs, including video layers, can use an H.264 proxy. Thumbnails and independent extracted audio continue to read originals.

Open **الترجمة** to add sentences or import an SRT file, either appending to the current track or replacing it. Edit start/end times, drag cue bodies to move them, or trim their edges; snapping, multiselection, copy/paste, duplication and undo work on this track. To split a sentence, place the video playhead inside its interval and the text caret between its words, then choose **تقسيم**. Merge adjacent selected sentences to combine their text and full time span, including any intervening gap. Locking protects the track from edits.

Subtitle style applies to the whole track: font and weight, size, fill, background opacity, outline, alignment, text direction and bottom margin. Overlapping cues stack, and the editor warns about overlaps, long sentences and cues beyond the main video. Preview visibility and burning into the exported video are separate settings. Video output clips subtitles to the main duration; SRT export retains every cue and its timing but cannot carry these visual styles. Captions use the same font renderer in preview and export, including conversion to the project's HDR color space.

SRT imports accept UTF-8 (with or without BOM) and UTF-16 with BOM, up to 2 MB. Limits are 500 cues and 1,000 characters per cue. Invalid imports are rejected as a whole. Text is plain text: markup stays literal, and blank lines inside a cue are rejected because SRT uses blank lines to separate records. Ordinary multiline sentences are supported. Burned captions use a single timed image stream; preparation supports cancellation and has an 80 MB image-data limit.

Noto Sans Arabic and Noto Naskh Arabic are bundled in regular and bold weights, with their [licenses and source information](app/assets/fonts/SOURCES.md). Existing projects retain their font selections. A missing system font produces a fallback notice without replacing its saved name. Export waits for bundled fonts to load. The bundled fonts and Arabic/mixed-language rendering have been checked on macOS; a physical Windows verification remains outstanding.

Open **الأخيرة** to revisit a project. Its thumbnail shows the first source, not a rendered montage. Missing projects offer **تحديد الموقع**. Removing an entry deletes only the shortcut. The list is local to this computer, holds 20 entries, and is updated after successful saves and opens.

In export settings, enable **تصدير جزء من المشروع** and set its start/end in seconds, or use `I` and `O` at the timeline playhead. The end is exclusive; both edges advance to the next output-frame boundary. The dialog displays the actual duration and frame count. Range output starts at zero and preserves the full composition's transition, title, layer, caption and mixed-audio state. Rendering may process earlier frames to preserve this result. The range is a session setting and resets when opening a project.

## Editing shortcuts

Open **مساعدة** in the side rail or press F1 to search the Arabic guide and view the complete shortcut list. Enter on a timeline item opens its properties; Alt+P focuses the current selection’s properties, and Shift+F10 or right-click opens its contextual actions. Arrow keys and Home/End navigate the property-type buttons. Use `⌘` on Mac or `Ctrl` on Windows for save (`S`), open (`O`), import (`I`), undo (`Z`), redo (`Shift+Z`), and export (`Shift+E`). Text fields keep their normal editing shortcuts.

Outside input fields, `S` splits at the playhead, `C` toggles the scissors, `V` returns to selection, and `F` fits the entire timeline. Left/right arrows seek one frame; hold Shift to seek one second. Space plays or pauses when focus is on the editing surface. Playback restarts from the beginning when already at the end.

Drag the handle above the timeline to resize it, or focus it and use Up/Down. Double-click it to restore the default height. Timeline height and the active inspector tab are remembered locally without changing the project. The inspector separates text, appearance, timing/animation, and templates; its tabs stay visible while scrolling.

## Projects and privacy

Use **حفظ مع الملفات** to create a project folder containing a `.sahl` file and a `media` folder. Move the whole folder to keep its media available. Original files are copied without re-encoding.

New saves use project format version 6 to preserve subtitles, their style and burn setting alongside visual layers, preview choices, speed, pitch, freeze frames, transitions, audio, links and framing settings. Version 1–5 projects still open. Imported subtitle text is embedded in the project and recovery snapshots, so the original SRT is not required. When replacing an older manifest, the app first keeps its original bytes in a `.v1-backup` through `.v5-backup` file alongside it; existing backups are never overwritten. Older app versions cannot open version 6 projects. The project-format version is separate from the app release version.

Automatic recovery stores the latest edits locally every minute and copies new or changed videos, images and audio into the application’s local `recovery/media` folder without re-encoding. The toolbar shows copy progress; a completed autosave means both edits and their media copies are ready. Unchanged files are reused on later saves, across tabs and after recovery. Once the first backup completes, moving or deleting an original no longer prevents direct recovery. Copying runs in the background, and edits since the last completed snapshot may still be lost after a crash. A failed or interrupted copy leaves the previous complete snapshot intact. Shared media copies are retained while referenced by either recovery generation, and removed when their recoveries are cleared after saving or discarding the project. Use **حفظ مع الملفات** for a project folder you can transfer to another computer.

Editing and rendering happen on your computer. Project files and videos are not uploaded. The update checker contacts GitHub to read release metadata and downloads a release only on request. Optional transcription downloads its model from Hugging Face when requested; audio stays on your computer. Recent-project paths and thumbnails are stored locally.

## Development

Use Node.js **24.18.0** and npm on Windows or macOS.

```sh
npm ci
npm start
```

Local development also runs on macOS. Hardware export uses **Apple · VideoToolbox** on supported Macs, including Apple Silicon; the app verifies it with a real hardware-only encode before offering it. Output bitrate scales with resolution, frame rate and the selected quality. Effects still use the CPU. If no hardware encoder is available, export defaults to CPU. Windows and both Mac architectures are built by the release workflow.

Run the tests and build the installer for the current native platform/architecture:

```sh
npm test
npx electron tests/electron-protocol.cjs
npx electron tests/electron-clip-controls.cjs
npx electron tests/electron-audio-tracks.cjs
npx electron tests/electron-motion.cjs
npx electron tests/electron-layers.cjs
npx electron tests/electron-captions.cjs
npx electron tests/electron-workflow.cjs
npx electron tests/electron-integrated-ui.cjs
npm run dist:release
npm run verify:package
```

Run the native Electron checks one at a time to reduce contention during playback timing checks. Build output is written to `dist/`. Tests cover project portability and recovery, timeline editing, text placement, real video exports, cancellation, update integrity, and tag-based release versioning. Hardware encoding tests are skipped when no supported GPU encoder is available. The package verifier runs the bundled FFmpeg and FFprobe with an empty PATH, exports a small video and inspects it. On Mac it also verifies native binary architecture and checks for external Homebrew dependencies.

To compare export speed locally against the previous pipeline, run `node scripts/benchmark-export.cjs` (or add `--cpu`). It runs the same 4K60 scene twice per pipeline in alternating order and writes timings to `test-output/export-benchmark/results.json`. Results depend on the hardware and project; the optimization helps most with titles and still images. Regression tests compare every uncompressed frame and audio packet against the previous pipeline, including fades, overlapping titles, cuts, resizing and fractional frame rates.

## Local transcription (experimental accuracy)

The editor uses whisper.cpp v1.8.2 with multilingual Whisper Small and Silero VAD 5.1.2. [Measured results and limits](app/assets/transcription/EXPERIMENT.md) document the initial model comparison and expanded Iraqi/MSA evaluation. Recognition is local; accuracy still requires human correction.

`npm run dist:release` (also `dist` / `dist:mac`) builds a pinned native runtime, verifies its hash and the 885 KB speech detector, includes their licenses and packages only the current platform. Developers need Git, CMake and a native C++ compiler: Xcode Command Line Tools on Mac or Visual Studio C++ on Windows. End users need no compiler. `npm run prepare:transcription` prepares development runs; `-- --x64` can cross-build just the Intel engine on Mac. The runtime is ignored by Git but included in release builds. The speech binary participates in the existing Mac signing/notarization flow when credentials are configured.

Open **تفريغ صوت محلي · تجريبي** from the captions panel and select a main video or audio piece. The 487.6 MB recognition model downloads only on request, with progress, cancellation, deletion and size/SHA-256 checks. No model is fetched on startup. Once provisioned, transcription works offline. The recognizer hears the original source speed, then maps sentence times to the piece's playback speed and project position. Pieces may span up to ten minutes of project time. Speech detection reduces false captions during silence; optional steady-noise reduction can help hiss but can also damage clear speech. Review the draft before appending captions; one undo removes the insertion. Long segments are divided proportionally and need timing review. Mixed-soundtrack transcription and speaker identification are not supported.

The explicit developer/CI command `node scripts/provision-speech-model.cjs` downloads and verifies the model in ignored `test-output/`. `npm run verify:speech` checks actual silence/noise recognition and, when available, a padded Arabic sample's speed/timestamp mapping. Set `SAHL_SPEECH_MODEL` to an existing model to use another location. The package verifier accepts the same variable and runs actual packaged inference with an empty PATH. Without it, the package check validates the engine/detector and launches its help command but does not claim an inference test.

`npx electron tests/electron-transcription.cjs` additionally exercises real speech review, insertion/undo and cancellation; it requires the model and `test-output/transcription/msa-0.wav`. Ordinary `npm test` uses deterministic fixtures and never downloads models or recordings. `python3 scripts/fetch-speech-evaluation.py` retrieves a fixed 20 Iraqi + 10 MSA test subset for opt-in research; `scripts/benchmark-transcription.py --help` explains evaluation with optional VAD. Recordings and reference transcripts remain excluded from Git and packages.

`.github/workflows/desktop-validation.yml` validates native Windows x64, Mac arm64 and Intel packages on pull requests or manual dispatch without publishing. Release-tag builds run the same speech and package checks before the existing publication gate. Local evidence covers native Apple Silicon and Intel binaries/packages running through Rosetta; it does not substitute for an actual Windows or Intel-host CI run. Mac builds without Apple credentials use ad-hoc signing and are not notarized.

## Publishing a release

A release is built and published **only when a version tag is pushed**. Pushing changes to `main` does not start a release, and there is no manual publish button.

Use a new stable tag in the form **`vMAJOR.MINOR.PATCH`**, such as `v1.0.1`. The tag determines the version shown in the app, the release title, and the installer filenames. For example, `v2.4.0` produces version `2.4.0` and `Sahl-Video-2.4.0.exe`; you do not need to edit package version fields yourself.

1. Push changes on a separate branch, open a pull request, and merge it after the required review.
2. Create the desired version tag on the commit you want to release.
3. Push that tag to GitHub. Creating it locally alone does not trigger a build.
4. GitHub Actions tests and builds the tagged code, then publishes Windows EXE, Apple Silicon DMG/ZIP, Intel DMG/ZIP, checksums and applicable update metadata only after all three native jobs pass.

For example, from the commit you want to release:

```sh
git tag v1.0.1
git push origin v1.0.1
```

Choose an unused, higher version for each update. Retry failed builds with the same tag; do not move published tags to different commits. The workflow never creates or deletes version tags. In-app update notifications become available after the release is published.

## Optional Apple signing for direct Mac updates

The workflow builds usable artifacts without signing credentials and does not publish `latest-mac.yml` for unsigned builds. To distribute notarized Mac releases with direct updates, configure these repository Actions secrets:

- `MAC_CSC_LINK`: base64-encoded Developer ID Application `.p12` certificate.
- `MAC_CSC_KEY_PASSWORD`: password for that certificate.
- `APPLE_ID`: Apple Developer account used for notarization.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for notarization.
- `APPLE_TEAM_ID`: Developer team ID.

Both Mac jobs then sign the app and bundled tools, notarize it, and verify the notarization ticket before publication. Partial signing configuration fails the build. Each architecture is built natively so the FFmpeg and FFprobe binaries match. The publish job validates every artifact's version, commit and SHA-256, validates the update metadata's SHA-512, and merges both signed Mac architectures into one `latest-mac.yml` without overwriting either architecture's entry. It uploads everything before marking the release ready. No credentials are embedded in the application.

## Contributing

Open an issue with reproduction steps, your OS version and CPU architecture, and the relevant video format. Pull requests are welcome. Avoid committing personal media, saved projects, build outputs, or credentials.

## License

The application source is available under the [MIT License](LICENSE). Electron, FFmpeg, FFprobe, fonts, and other bundled dependencies retain their own licenses. Anton's SIL Open Font License is included in `app/assets/fonts/Anton-OFL.txt`.

Autosave recovery uses its local media copies directly. For older snapshots without copies, Sahl also checks original locations and remembered portable projects for the same asset ID. Missing sources are listed in the recovery dialog; a file picker opens only after selecting **تحديد موقع الملفات المفقودة**. Failed or canceled recovery keeps the snapshot. Files already missing before their first successful backup still need to be restored or located.
