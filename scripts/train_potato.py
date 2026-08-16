#!/usr/bin/env python3
"""Finetune YOLOv8n on the locally-captured potato dataset and export ONNX.

Invoked by the puppet rig's localhost-only /puppets/train route (the "train" button in
capture mode), but also runnable by hand:

    venv_pls && python scripts/train_potato.py \
        public/puppets/potato_model/dataset/data.yaml \
        public/puppets/potato_model/potato.onnx 640 80

Args: <data.yaml> <onnx_out> [imgsz=640] [epochs=80]
Needs `ultralytics` installed in the active env.
"""
import os
import sys
import shutil


def main():
    if len(sys.argv) < 3:
        print("usage: train_potato.py <data.yaml> <onnx_out> [imgsz] [epochs]", flush=True)
        sys.exit(2)
    data   = sys.argv[1]
    out    = sys.argv[2]
    imgsz  = int(sys.argv[3]) if len(sys.argv) > 3 else 480
    epochs = int(sys.argv[4]) if len(sys.argv) > 4 else 25

    from ultralytics import YOLO

    # Device: Apple Silicon → mps; else let Ultralytics pick (cuda if present, else cpu).
    device = None
    try:
        import torch
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            device = "mps"
    except Exception:
        pass

    print(f"[train] data={data} imgsz={imgsz} epochs={epochs} device={device or 'auto'}", flush=True)
    model = YOLO("yolov8n.pt")
    results = model.train(
        data=data, epochs=epochs, imgsz=imgsz, batch=16,
        device=device, patience=10, verbose=True,
        cache=True,   # tiny dataset → cache in RAM to cut per-epoch data-loading time
    )

    best = os.path.join(str(results.save_dir), "weights", "best.pt")
    print(f"[train] BEST {best}", flush=True)
    exported = YOLO(best).export(format="onnx", imgsz=imgsz, opset=12, simplify=True)
    shutil.copy(exported, out)

    # Sidecar the browser module reads so its input size matches this export.
    import json
    with open(os.path.join(os.path.dirname(out), "potato.meta.json"), "w") as f:
        json.dump({"imgsz": imgsz, "names": ["potato"]}, f)

    print(f"[train] DONE {out}", flush=True)


if __name__ == "__main__":
    main()
