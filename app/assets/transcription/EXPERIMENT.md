# Local Arabic transcription evaluation — 2026-10-19

The editor uses multilingual **Whisper Small** with Silero speech detection. This is an exploratory feasibility evaluation, not a general accuracy guarantee. Recognition runs locally and the draft requires correction. No cloud transcription or audio upload is used.

## Engine, models and sources

- [whisper.cpp v1.8.2](https://github.com/ggml-org/whisper.cpp/tree/v1.8.2), commit `4979e04f5dcaccb36057e059bbaed8a2f5288315`. Static CPU build, four threads, GPU/OpenMP disabled, no host-specific x86 instruction flags. Mac builds use the system Accelerate framework. [Engine MIT license](WHISPER-CPP-LICENSE.txt).
- Unquantized multilingual GGML models from the [official conversion repository](https://huggingface.co/ggerganov/whisper.cpp), [MIT license](WHISPER-MODEL-LICENSE.txt). Small: 487,601,967 bytes, SHA-256 `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b`. Base: 147,951,465 bytes, SHA-256 `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`.
- [Silero VAD 5.1.2 GGML conversion](https://huggingface.co/ggml-org/whisper-vad), 885,098 bytes, SHA-256 `29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf`, [Silero MIT license](SILERO-VAD-LICENSE.txt). Threshold 0.5; minimum speech 250 ms; minimum silence 300 ms; padding 200 ms; maximum speech segment 30 s. These settings were fixed before the expanded comparison.
- Iraqi: first 20 test rows labelled `iq`, ordered by row index, in [oddadmix/dialectal-arabic-lahgtna-v2](https://huggingface.co/datasets/oddadmix/dialectal-arabic-lahgtna-v2): 58, 61, 236, 378, 456, 495, 559, 589, 605, 654, 695, 716, 737, 793, 855, 875, 880, 885, 898, 951. The supplied labels/reference transcripts have not been independently verified. The card does not specify a redistribution license; no recordings or reference text are distributed. Metadata observed after the current row download identifies revision `7b6a2cc93c31ccd9de612a8ab058fda2aeb45a58`; the rows API served the current test split.
- MSA: test/ar_eg rows 0–9 of [Google FLEURS](https://huggingface.co/datasets/google/fleurs), revision observed after download `70bb2e84b976b7e960aa89f1c648e09c59f894dd`. This is read Arabic speech, not evidence of Iraqi-dialect quality.
- Host: Apple M4 Pro, macOS. Per-process wall time uses Python monotonic time; peak RSS uses `/usr/bin/time -l`. Model loading is included, downloads/builds excluded. Single passes, uncontrolled OS cache, some concurrent packaging work: performance numbers are exploratory, not a hardware comparison.

## Expanded evaluation

The subset was selected before recognition, without choosing samples by accuracy. It contains 20 Iraqi clips (357.464 seconds, 860 normalized reference words) and 10 MSA clips (125.660 seconds, 216 words).

| Configuration | Iraqi WER (20) | MSA WER (10) | Median per clip | Range per clip | Peak RSS |
| --- | --- | --- | --- | --- | --- |
| Base + VAD | 59.07% | 37.96% | 0.884 s | 0.516–1.733 s | 304.7 MiB |
| Small, no VAD | 50.12% | 22.22% | 2.238 s | 1.589–16.222 s | 782.5 MiB |
| Small + VAD | 45.81% | 21.76% | 2.355 s | 1.650–16.076 s | 784.5 MiB |

Small remains the default because it made fewer word errors in both groups; its larger download, memory and slower worst-case decoding are real costs. VAD improved these aggregate results and prevented captions in the deterministic silence/noise checks below. It may still omit short/quiet speech or mistake other sounds for speech. Twenty Iraqi clips do not establish dialect coverage, speaker fairness or general robustness. WER of 45.81% still requires substantial correction.

WER is word edit distance divided by reference word count, weighted by reference length in each group. Normalization applies NFKC, removes diacritics/punctuation and bracketed non-speech events, normalizes alef variants and alef-maqsura, and lowercases. It does not replace dialect words with MSA. No independent human scoring was performed.

The earlier four-clip pilot (two Iraqi, two MSA) gave Base 52.34% / 48.89% and Small 38.32% / 40.00%, without VAD. Those pilot values are retained as history, not mixed into the expanded aggregates. The initial Iraqi source metadata was recorded as `6cef8d3a3a9b0aef4f95f606e0d675d41a3108af`.

## Noise, silence and timing

A synthetic stress check uses the first three clips in each group, with seeded pink noise (`seed=42`, amplitude 0.05, 16 kHz), mixed without normalization. It is a fixed-amplitude test, not a controlled SNR or a substitute for real noisy recordings. With Small + VAD:

| Processing | Iraqi WER (3) | MSA WER (3) |
| --- | --- | --- |
| Added noise | 69.41% | 30.43% |
| Added noise, then high-pass 80 Hz + `afftdn=nf=-25` | 62.35% | 31.88% |

Noise reduction helped this Iraqi subset but slightly harmed MSA. Therefore it is an explicit option, off by default. Clean speech should normally leave it off.

Actual native checks on arm64 and the x64 engine through Rosetta produced zero captions for four seconds of digital silence and four seconds of seeded white noise (amplitude 0.015). A padded Arabic sample retained its leading/trailing silence timing. Recognition at project speeds 1× and 2× produced the same text, with correctly scaled project timestamps. The recognizer processes original-speed source audio, then maps times; it does not attempt recognition on sped-up audio. These checks do not prove all silence/music/noise cases safe.

## Reproduction

`npm run prepare:transcription` builds the pinned native engine and downloads only the checked 885 KB detector. The explicit developer command `node scripts/provision-speech-model.cjs` provisions the checked Small model. Neither runs on ordinary app startup.

`python3 scripts/fetch-speech-evaluation.py` downloads the fixed test subset to ignored `test-output/transcription/expanded/`. New downloads record source revisions and audio hashes and reject a revision change during download. `scripts/benchmark-transcription.py` takes `--engine`, `--model`, `--manifest`, `--output`, and optional `--vad`. `node scripts/make-speech-noise-evaluation.cjs` creates the paired synthetic stress subsets. Raw manifests, recordings, hypotheses, timing and RSS logs remain in ignored `test-output/`; they are not in Git or application packages.

Current aggregate evidence: `expanded-plain/results.json`, `expanded-vad/results.json`, `expanded-base-vad/results.json`, `noisy-results/results.json`, `denoised-results/results.json` under `test-output/transcription/`. Native checks: `npm run verify:speech`, plus `npx electron tests/electron-transcription.cjs` with the local Arabic fixture. Ordinary `npm test` requires no downloads.

## Packaging and remaining validation

The normal native build now includes only its target's checked engine, detector and licenses. The recognition model remains an on-demand download with size/SHA-256 checks, progress, cancellation and deletion. Installed users need no compiler. The local source runtime is ignored by Git. Mac signing includes the speech executable; Windows builds request a static MSVC runtime and package validation checks imports for unwanted runtime DLLs.

Apple Silicon and Intel DMG/ZIP builds are prepared locally; Intel runs through Rosetta on the same ARM Mac. Package checks verify source parity, architecture, licenses/detector integrity, absence of development files/other platform runtimes, system-library independence, code-signature integrity, offline SDR/HDR export, and actual speech inference with an empty PATH and an explicitly provisioned model. Mac builds without Apple credentials are ad-hoc signed and not notarized. No upload or release publication is performed by local builds.

Native Windows and an actual Intel host still require the prepared CI matrix or corresponding machines. The non-publishing validation workflow covers all three targets, while release-tag publication remains gated on the native jobs. Do not treat workflow preparation or Rosetta as evidence those native hosts passed. No mixed-soundtrack transcription, diarization or promise of production-level recognition accuracy is made.
