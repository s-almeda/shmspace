# Training the potato detector (free, no Roboflow credits)

Goal: a small YOLOv8n one-class ("potato") detector, exported to **ONNX**, that we run
in-browser with onnxruntime-web. Training happens in a free Google Colab GPU runtime.
Forking + downloading the dataset from Roboflow is **free** (credits are only spent on
Roboflow *training* and *hosted inference* — we do neither).

## 0. Fork the dataset on Roboflow (free)
1. Open the Universe dataset: https://universe.roboflow.com/yolo-4qlka/potato-detection-3et6q-o4ogu
2. Fork it into your own workspace (or just use it directly — you only need the download
   snippet, which is free).
3. On the dataset's **Download** screen, choose format **YOLOv8** and pick "show download
   code". You'll get a snippet like the one in step 2 below (with your API key + the right
   workspace/project/version). Copy it.

## 1. Colab setup
Create a new notebook at https://colab.research.google.com, set Runtime → Change runtime
type → **T4 GPU**, then run these cells.

```python
# Cell 1 — install
!pip install ultralytics roboflow onnx onnxruntime
```

## 2. Download the dataset (paste YOUR snippet from step 0)
```python
# Cell 2 — replace with the exact snippet Roboflow gave you (YOLOv8 format).
from roboflow import Roboflow
rf = Roboflow(api_key="YOUR_PRIVATE_API_KEY")   # your account key; used only to download
project = rf.workspace("yolo-4qlka").project("potato-detection-3et6q-o4ogu")
version = project.version(1)                     # use the version number from the snippet
dataset = version.download("yolov8")
print("data.yaml at:", dataset.location + "/data.yaml")
```

## 3. Train YOLOv8n
```python
# Cell 3 — train. imgsz=320 keeps the browser model fast; bump epochs if accuracy is low.
from ultralytics import YOLO
model = YOLO("yolov8n.pt")
model.train(data=dataset.location + "/data.yaml", epochs=60, imgsz=320, batch=16)
```

## 4. Quick sanity check (optional)
```python
# Cell 4 — run on a few val images to eyeball detections.
metrics = model.val()
print(metrics.box.map)  # mAP50-95
```

## 5. Export to ONNX
```python
# Cell 5 — export. opset 12 + simplify plays nicely with onnxruntime-web.
best = YOLO("runs/detect/train/weights/best.pt")
path = best.export(format="onnx", imgsz=320, opset=12, simplify=True)
print("exported:", path)   # -> runs/detect/train/weights/best.onnx
```

## 6. Download the model + note the class list
```python
# Cell 6 — download best.onnx to your computer, then drop it into the repo as
#          public/puppets/potato_model/potato.onnx
from google.colab import files
files.download(path)
print("classes:", best.names)   # should be {0: 'potato'} (or similar) — tell me the exact name/order
```

## Hand-off to me
Put the file here in the repo:
```
public/puppets/potato_model/potato.onnx
```
and tell me:
- the **input size** you trained at (we used `imgsz=320` above),
- the **class names/order** printed in Cell 6 (for a 1-class model it's just `potato`).

I'll wire the browser inference (onnxruntime-web) with decode + NMS, LERP-smoothed
tracking box, the overlay graphic, analysis-panel confidence/smoothing sliders, and the
scene-gated manual fallback. The `.onnx` file is served locally, so no internet at showtime.
```

> Tip: if the browser model feels heavy on your laptop, re-export at `imgsz=256` or add
> `int8=True` to the export for a smaller/faster model — accuracy drops a little.

## Improving accuracy on YOUR real potato (domain adaptation)

A model trained only on the generic Universe dataset is weak on a webcam view of your hand
holding a potato in your room (different lighting/distance/background). Since the show only
needs THIS potato in THIS setting, the fix is to train on frames of exactly that.

1. **Capture frames** with the rig's built-in tool (no manual photography):
   run `node App.js`, open `/puppets?rig=capture`, hit showtime, then press **`c`** (single)
   or **`v`** (burst) while showing / holding / tossing the potato. Aim for ~60–150 frames
   with variety in position, scale, and rotation — but keep it your potato + your lighting.
   Frames land in `public/puppets/potato_model/captures/`.
2. **Annotate** on Roboflow (free): upload that folder to your project, draw a tight box on
   the potato in each frame. Easiest is to add them to your existing fork and label them
   `Potato`; a fresh single-class `potato` project works too (the rig handles either).
3. **Generate a version** (resize 640×640) and **retrain at `imgsz=640`** (Cell 3), optionally
   `yolov8s` and more epochs for a bit more accuracy. Export ONNX (Cell 5) and drop the new
   `potato.onnx` in. Tell me the `imgsz` you used so the browser module matches.
4. Reload `/puppets?rig=potatotest` and watch `best score seen` — it should jump well above
   your confidence threshold on the real potato.
