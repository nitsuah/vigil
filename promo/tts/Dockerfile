# Narration for vertical spots: Hyperframes' `tts` command (Kokoro-82M, local)
# needs a Python with kokoro-onnx next to Node. Build from the repo root:
#   docker build -f promo/tts/Dockerfile -t vigil-promo-tts promo/tts
FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv espeak-ng && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/kokoro && /opt/kokoro/bin/pip install --no-cache-dir kokoro-onnx==0.4.9 soundfile==0.13.1
ENV HYPERFRAMES_PYTHON=/opt/kokoro/bin/python
RUN npm install -g hyperframes@0.8.142 && (hyperframes telemetry disable || true)
