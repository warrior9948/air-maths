# AIR MATHS BOARD — Stage 1

A mobile-first, static-browser foundation for gesture-controlled mathematics and science interaction.

## Files

- `index.html` — semantic application shell and MediaPipe CDN loader
- `style.css` — responsive futuristic UI
- `script.js` — modular camera, tracking, coordinate, gesture, drawing, cursor, UI and performance systems

## Run locally

Camera APIs require a secure context.

### Option A — VS Code / any static server

From this folder:

```bash
python -m http.server 8000
```

Open:

`http://localhost:8000`

### Option B — VS Code Live Server

Open the folder and launch `index.html` through Live Server.

Do not rely on `file://...` for camera access.

## GitHub Pages

1. Create a GitHub repository.
2. Upload `index.html`, `style.css`, and `script.js`.
3. Commit to the default branch.
4. Open **Settings → Pages**.
5. Select **Deploy from a branch**.
6. Select the branch and `/ (root)`.
7. Save.
8. Open the generated HTTPS Pages URL.

## Android testing

1. Open the GitHub Pages HTTPS URL in Chrome.
2. Tap **START BOARD**.
3. Allow camera permission.
4. Hold the phone so your hand is visible.
5. Extend your index finger to draw.
6. Lower/close the index finger to stop.
7. Use **CLEAR** to erase.
8. Rotate the phone and verify alignment again.

## Privacy

Camera frames are consumed in the browser for MediaPipe hand tracking. This project contains no backend, analytics, accounts, database, or camera upload mechanism.

## Stage 1 scope

Implemented:
- camera permission and lifecycle
- front-facing camera preference
- MediaPipe Hands
- 21-landmark tracking
- index-finger gesture
- adaptive cursor smoothing
- coordinate transformation for mirrored cover video
- device-pixel-ratio canvas rendering
- smooth air drawing
- clear/start/stop/restart
- orientation/viewport resizing
- status + FPS + latency
- error/retry handling
- accessible controls
- GitHub Pages-compatible static architecture

Intentionally not implemented:
- mathematical OCR/recognition
- equation solving
- AI
- advanced gestures
- geometry recognition
- voice control
- backend/cloud processing
