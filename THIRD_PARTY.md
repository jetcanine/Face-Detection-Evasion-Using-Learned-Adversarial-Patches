# Bundled third-party components

Retain the license and attribution files when redistributing this project.

| Component | Version / source | Local attribution |
| --- | --- | --- |
| face-api.js (including TensorFlow.js runtime) | 0.22.2, https://github.com/justadudewhohacks/face-api.js | `static/vendor/face-api-LICENSE` |
| Tiny Face Detector weights | face-api.js weights distribution | Upstream face-api.js repository and license |
| MediaPipe Tasks Vision JS/WASM | 0.10.21, https://www.npmjs.com/package/@mediapipe/tasks-vision | `static/vendor/mediapipe/LICENSE` |
| Face Landmarker model | float16 / version 1, https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task | See Google model documentation and upstream terms |
| Canonical face model / topology | https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj | `static/vendor/mediapipe/LICENSE` |

`mesh-data.js` derives its topology from the MediaPipe canonical model. The region selection and renderer are project code. Model redistribution should retain applicable upstream terms; the research citations do not imply that their implementations are included.
