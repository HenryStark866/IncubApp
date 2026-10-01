# Lector propio de fotos de ronda (IncubApp). Todo local, sin servicios externos.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir rapidocr_onnxruntime==1.3.24 opencv-python-headless==4.10.0.84 "numpy<2" psycopg2-binary==2.9.9 requests==2.32.3
WORKDIR /app
COPY *.py /app/
