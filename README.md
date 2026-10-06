# Face Detection Avoidance

A Flask website for testing whether a virtual face pattern can make Tiny Face Detector miss a face. Includes the white theme, three-pose face mapping, curved cheek/forehead/lower-face filters, personal pattern learning, and independent original/filtered detection checks.

**Flask serves the website. Face tracking, detection, rendering and learning run in JavaScript in the visitor's browser.** No camera images are sent to Flask. A server GPU, Google API key, database and Node build step are not required.

## Run locally

Use Python 3.10 or newer.

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

If PowerShell blocks activation, use `.\.venv\Scripts\python.exe` directly instead of `python` for the last two commands.

macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

Open **http://localhost:5000** on that computer. Start the camera, choose **Map the filter**, follow the pose prompts, choose a shape and learn its pattern. Compare the learned surface against plain gray.

Camera access works on localhost or HTTPS. Opening `http://<computer-LAN-IP>:5000` on a phone is generally not a secure camera context. Use an HTTPS deployment for phone testing. First startup downloads the bundled assets from your own server; it may take longer than subsequent starts.

## Components

| File | Responsibility |
| --- | --- |
| `app.py` | Flask application, page route and health endpoint |
| `serve.py` | Waitress production server entry point |
| `templates/index.html` | Page layout and text, served as a Jinja template |
| `static/css/style.css` | White theme and responsive layout |
| `static/js/boot.js` | Startup loading and visible startup failures |
| `static/js/app.js` | Camera lifecycle, UI, face mapping, rendering schedule and comparison metrics |
| `static/js/face-tracker.js` | MediaPipe component: starts/stops its worker and manages requests |
| `static/js/face-tracker-worker.js` | MediaPipe Face Landmarker inference off the UI thread |
| `static/js/pattern-learning.js` | Learning loop, captured pose preparation, progress and tensor cleanup |
| `static/js/pattern-optimizer.js` | Differentiable texture sampling, detector objective and gradient updates |
| `static/js/mesh-renderer.js` | Curved surface rendering, depth visibility and texture sampling |
| `static/js/mesh-data.js` | Canonical mesh topology, UV coordinates and experimental region definitions |
| `static/models/` | Tiny Face Detector weights and MediaPipe Face Landmarker model |
| `static/vendor/` | Locally bundled face-api.js and MediaPipe JavaScript/WASM with available licenses |

The Google component is **MediaPipe Face Landmarker**, not a cloud Face API. `face-api.js` is a separate open-source library used for Tiny Face Detector and its bundled TensorFlow.js runtime.

### Pattern-learning module

`PatternLearning.learn({api, samples, method, size, steps, cancelled, onProgress})` returns a `Float32Array` containing a 16×16 RGB texture, or `null` when cancelled. Samples contain `{canvas, points}`. Method is `cheeks`, `mask` or `forehead`. `onProgress` receives `{step, total, values}`; texture values are supplied every four steps. The module accesses the mesh and optimizer modules, but does not reference page controls or Flask routes.

### Face-tracking module

`new FaceTracker(workerURL)` exposes `init()`, `detect(imageBitmap)` and `close()`. The worker owns and closes transferred image bitmaps. The UI serializes requests and prioritizes analysis snapshots so each detection comparison uses one fixed camera frame.

## How to read results

If the original frame has a face box and the filtered frame reports **Face not detected**, the pattern caused a miss for that evaluated frame. Miss rate is historical and only includes comparable frames where the original detector found the face and any required filter tracking was available. Preview images are live; boxes describe the latest analyzed snapshot. A stale or missing tracker is not evidence of successful avoidance.

This is a research-inspired digital demonstration using Tiny Face Detector. It does not reproduce the linked papers' full training procedures or establish effectiveness for printed masks, infrared cameras or other models. Face Landmarker estimates geometry from RGB images; hair and hands are not separately segmented. Camera frames, fitted poses and learned textures are held in memory and cleared when the camera stops; model assets may remain in the browser cache.

## References and licenses

- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
- [Yang et al.: Design and Interpretation of Universal Adversarial Patches in Face Detection](https://arxiv.org/abs/1912.05021)
- [Kaziakhmedov et al.: Real-world adversarial attack on MTCNN face detection system](https://arxiv.org/abs/1910.06261)
- [VIPatch](https://github.com/ge95net/VIPatch)
- [Flask quickstart](https://flask.palletsprojects.com/en/stable/quickstart/)
- [Flask deployment documentation](https://flask.palletsprojects.com/en/stable/deploying/)

See `THIRD_PARTY.md` for bundled dependencies. Choose a license for your own project code before presenting the repository as open source; third-party licenses still apply to their respective files.
