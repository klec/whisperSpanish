FROM node:20-bookworm

WORKDIR /app

ARG WHISPER_MODEL=medium

# whisper-node requirements and audio conversion tool.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg build-essential clang wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY batch-transcribe.js ./

# Install whisper-node locally and prepare whisper.cpp + model in image.
RUN npm install whisper-node --no-save \
  && cd /app/node_modules/whisper-node/lib/whisper.cpp/models \
  && ./download-ggml-model.sh ${WHISPER_MODEL} \
  && cd /app/node_modules/whisper-node/lib/whisper.cpp \
  && make CC=clang CXX=clang++

CMD ["node", "batch-transcribe.js", "/spanishResume/src", "/spanishResume/resume", "/spanishResume/processing"]
