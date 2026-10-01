# Asistente propio (solo Python estándar). Se construye desde la raíz del repositorio.
FROM python:3.11-slim
WORKDIR /app
COPY servidor-local/asistente/asistente.py .
COPY servidor-local/asistente/preguntas-frecuentes.md /docs/
COPY src/lib/incubationKnowledge.js docs/Offline_Operacion.md /docs/
COPY ["docs/Manual de Usuario - IncubApp.docx", "/docs/"]
CMD ["python", "asistente.py"]
