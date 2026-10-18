# Sahl Video | سهل

A free, open-source video editor for Windows and macOS with an Arabic interface. Cut clips, add reusable titles and images, and export at the original resolution or lower without a watermark.

[Download for Windows](https://github.com/hmh6a/sahl-video/releases/latest) · [Report an issue](https://github.com/hmh6a/sahl-video/issues) · [Build status](https://github.com/hmh6a/sahl-video/actions/workflows/windows-release.yml)

## Features

- **Organized workspace:** larger preview, searchable media library with video/image filters, tabbed text controls, adjustable timeline height, and an in-app shortcut guide. UI numbers use English digits.
- **Simple timeline editing:** split with the scissors tool, delete or reorder clips, scrub through thumbnails, and drag media onto the timeline.
- **Independent audio:** import music or recorded commentary into up to eight tracks; trim, move, duplicate, adjust gain/fades, mute or solo tracks, and extract linked video sound. Cached waveforms are generated in the background.
- **Timeline tools:** multiselection, internal copy/paste, duplicate, edge trimming, named markers, snapping, track locks, and gap/ripple audio deletion, with grouped undo.
- **Clip audio:** mute, adjust volume from 0–200%, and set independent audio fades. Playback includes a level meter and a soft ceiling when amplifying; exported audio uses the same gain and ceiling curve.
- **Canvas and framing:** choose source, landscape 16:9, portrait 9:16 or square dimensions, then fit/fill, zoom, move, rotate or flip each clip. Framing works with images and videos, supports undo, and is saved with the project.
- **Titles and templates:** multiple text layers with independent timing and placement, font selection, reusable layouts, and entrance animations. Anton is included.
- **Images and transitions:** insert images between clips or into a video, set their duration, and add picture and audio fades.
- **Portable projects:** save edits and their media in one folder, move it to another computer, and continue editing.
- **Recovery:** automatic recovery snapshots every minute, including while exporting.
- **Faster compositing:** static images and title layers are decoded and resized once, then reused at the original output frame rate. Title processing stops after its visible interval. Resolution, encoder quality and audio settings stay unchanged; background thumbnails pause during export.
- **Export controls:** source resolution by default, only resolutions smaller than the source (including 8K source projects), source frame rate, supported GPU encoders or CPU encoding, elapsed time, estimated time remaining, and cancellation.
- **Automatic HDR export:** timelines containing PQ or HLG video export as HEVC Main 10 in MP4, preserving HDR and the project resolution/frame rate. The first HDR clip determines the output transfer; SDR clips, images and sRGB titles are converted into that color space before 10-bit compositing. HEVC hardware support is tested separately; unsupported GPUs fall back to CPU without requiring external conversion. SDR-only projects retain H.264 export. HDR playback requires a compatible player/display. Dynamic Dolby Vision/HDR10+ and source mastering metadata are not carried into the edited montage; this is standard PQ/HLG output, not a Dolby Vision export. Thumbnails use SDR tone mapping for ordinary displays.
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

## Editing shortcuts

Open **مساعدة** in the side rail for the complete list. Use `⌘` on Mac or `Ctrl` on Windows for save (`S`), open (`O`), import (`I`), undo (`Z`), redo (`Shift+Z`), and export (`Shift+E`). Text fields keep their normal editing shortcuts.

Outside input fields, `S` splits at the playhead, `C` toggles the scissors, `V` returns to selection, and `F` fits the entire timeline. Left/right arrows seek one frame; hold Shift to seek one second. Space plays or pauses when focus is on the editing surface. Playback restarts from the beginning when already at the end.

Drag the handle above the timeline to resize it, or focus it and use Up/Down. Double-click it to restore the default height. Timeline height and the active inspector tab are remembered locally without changing the project. The inspector separates text, appearance, timing/animation, and templates; its tabs stay visible while scrolling.

## Projects and privacy

Use **حفظ مع الملفات** to create a project folder containing a `.sahl` file and a `media` folder. Move the whole folder to keep its media available. Original files are copied without re-encoding.

New saves use project format version 3 to preserve stable clip IDs, independent audio, links, track flags, markers and framing settings. Version 1 and 2 projects still open. When replacing an older manifest, the app first keeps its original bytes in a `.v1-backup` or `.v2-backup` file alongside it; existing backups are never overwritten. Older app versions cannot open version 3 projects. The project-format version is separate from the app release version.

Automatic recovery stores the latest edits locally every minute. Newly imported media remains linked to its original location until you save with files, and edits made since the last recovery snapshot may be lost after a crash.

Editing and rendering happen on your computer. Project files and videos are not uploaded. The update checker contacts GitHub to read release metadata and downloads a release only on request.

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
npm run dist:release
npm run verify:package
```

Build output is written to `dist/`. Tests cover project portability and recovery, timeline editing, text placement, real video exports, cancellation, update integrity, and tag-based release versioning. Hardware encoding tests are skipped when no supported GPU encoder is available. The package verifier runs the bundled FFmpeg and FFprobe with an empty PATH, exports a small video and inspects it. On Mac it also verifies native binary architecture and checks for external Homebrew dependencies.

To compare export speed locally against the previous pipeline, run `node scripts/benchmark-export.cjs` (or add `--cpu`). It runs the same 4K60 scene twice per pipeline in alternating order and writes timings to `test-output/export-benchmark/results.json`. Results depend on the hardware and project; the optimization helps most with titles and still images. Regression tests compare every uncompressed frame and audio packet against the previous pipeline, including fades, overlapping titles, cuts, resizing and fractional frame rates.

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
