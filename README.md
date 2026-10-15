# Sahl Video | سهل

A free, open-source video editor for Windows with an Arabic interface. Cut clips, add reusable titles and images, and export up to 4K without a watermark.

[Download for Windows](https://github.com/hmh6a/sahl-video/releases/latest) · [Report an issue](https://github.com/hmh6a/sahl-video/issues) · [Build status](https://github.com/hmh6a/sahl-video/actions/workflows/windows-release.yml)

## Features

- **Simple timeline editing:** split with the scissors tool, delete or reorder clips, scrub through thumbnails, and drag media onto the timeline.
- **Titles and templates:** multiple text layers with independent timing and placement, font selection, reusable layouts, and entrance animations. Anton is included.
- **Images and transitions:** insert images between clips or into a video, set their duration, and add picture and audio fades.
- **Portable projects:** save edits and their media in one folder, move it to another computer, and continue editing.
- **Recovery:** automatic recovery snapshots every minute, including while exporting.
- **Export controls:** source resolution by default, selectable output resolution up to 4K, source frame rate, supported GPU encoders or CPU encoding, elapsed time, estimated time remaining, and cancellation.
- **In-app updates:** automatic checks, a new-version notification, download progress and cancellation, and SHA-256 verification before the downloaded file is made available.

## Download and run

1. Open the [latest release](https://github.com/hmh6a/sahl-video/releases/latest).
2. Download `Sahl-Video-<version>.exe` from **Assets**.
3. Run it on 64-bit Windows. The portable application includes its video tools; Node.js and Python are not required.

The interface is in Arabic. Start with **استيراد فيديو**, use the scissors to cut, add titles from **الكتابة**, and choose **تصدير** when ready.

Updates are checked at startup and every six hours. You can also select **التحديثات → فحص الآن**. Downloads start only when you choose **تنزيل التحديث**. After downloading, save your project, close the current application, and open the new EXE. This portable build does not replace a running executable automatically.

The earlier experimental release series has been reset. Install **1.0.0** once to receive notifications for subsequent releases; experimental builds do not contain the updater.

## Projects and privacy

Use **حفظ مع الملفات** to create a project folder containing a `.sahl` file and a `media` folder. Move the whole folder to keep its media available. Original files are copied without re-encoding.

Automatic recovery stores the latest edits locally every minute. Newly imported media remains linked to its original location until you save with files, and edits made since the last recovery snapshot may be lost after a crash.

Editing and rendering happen on your computer. Project files and videos are not uploaded. The update checker contacts GitHub to read release metadata and downloads a release only on request.

## Development

Use Node.js **24.18.0** and npm on Windows.

```sh
npm ci
npm start
```

Run the tests and build a portable Windows application:

```sh
npm test
npx electron tests/electron-protocol.cjs
npm run dist -- --publish never
```

Build output is written to `dist/`. Tests cover project portability and recovery, timeline editing, text placement, real video exports, cancellation, update integrity, and tag-based release versioning. Hardware encoding tests are skipped when no supported GPU encoder is available.

## Publishing a release

A release is built and published **only when a version tag is pushed**. Pushing changes to `main` does not start a release, and there is no manual publish button.

Use a new stable tag in the form **`vMAJOR.MINOR.PATCH`**, such as `v1.0.1`. The tag determines the version shown in the app, the release title, and the EXE filename. For example, `v2.4.0` produces version `2.4.0` and `Sahl-Video-2.4.0.exe`; you do not need to edit package version fields yourself.

1. Commit your changes and push them to GitHub.
2. Create the desired version tag on the commit you want to release.
3. Push that tag to GitHub. Creating it locally alone does not trigger a build.
4. GitHub Actions tests and builds the tagged code, then publishes its EXE and checksum file if the checks pass.

For example, from the commit you want to release:

```sh
git tag v1.0.1
git push origin v1.0.1
```

Choose an unused, higher version for each update. Retry failed builds with the same tag; do not move published tags to different commits. The workflow never creates or deletes version tags. In-app update notifications become available after the release is published.

## Contributing

Open an issue with reproduction steps, your Windows version, and the relevant video format. Pull requests are welcome. Avoid committing personal media, saved projects, build outputs, or credentials.

## License

The application source is available under the [MIT License](LICENSE). Electron, FFmpeg, FFprobe, fonts, and other bundled dependencies retain their own licenses. Anton's SIL Open Font License is included in `app/assets/fonts/Anton-OFL.txt`.
