# Greenhouse post screenshots

Five 1080 × 1080 images captured from the running app through public controls. These are source images for a later LinkedIn post; nothing has been published.

| Image | What it shows |
| --- | --- |
| [overview.png](overview.png) | The original greenhouse, Pip, capsule, dock and workspace. Initial reference controller, before execution. |
| [learned-carrying.png](learned-carrying.png) | Live seed-42 execution of the selected PPO checkpoint, paused while carrying the capsule; follow camera. |
| [training.png](training.png) | Saved training results, fitting-loss history and checkpoint selection. Metrics are from the existing local experiments. |
| [policy-comparison.png](policy-comparison.png) | Recorded same-seed validation comparison. Seed 10006 exposes pickup failures in both selected BC and PPO; the scripted reference completes it. |
| [mission.png](mission.png) | A live learned multi-capsule mission, paused after its first delivery; collection uses the selected learned checkpoint, docking is scripted. |

[Capture identities and timing](../media/capture.json) · [README GIF](../media/preview.gif) · [preview MP4](../media/preview.mp4) · [square MP4 for X](../media/x-preview.mp4)

The GIF and MP4 share a 7.2-second live scripted-reference collection sequence. The policy-comparison screenshot shows stored-state validation results; learned carrying and mission progress are separate live screenshots.

To regenerate, start `pnpm dev:greenhouse`, prepare the documented BC/PPO artifacts, then run `pnpm screenshots:greenhouse`. The preview GIF and MP4 use the global reference-collection frames and are regenerated with `pnpm readme:gif`. `GREENHOUSE_URL` overrides the default frontend URL. Requires local Chrome/WebGPU and ffmpeg. The script creates temporary sessions, reads existing models, cancels its screenshot mission and leaves datasets/model weights unchanged.

The square X video is captured separately from a fresh seed-42 reference collection. Run `pnpm video:greenhouse:x` with the app running to regenerate it; [its metadata](../media/x-preview.json) records timing and the delivery checks.
