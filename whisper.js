const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const originalCwd = process.cwd();
const whisper = require('whisper-node').default;
const defaultModelPath = path.join(
  __dirname,
  'node_modules',
  'whisper-node',
  'lib',
  'whisper.cpp',
  'models',
  'ggml-base.bin',
);

const options = {
  // Можно переопределить путь через WHISPER_MODEL_PATH.
  modelPath: process.env.WHISPER_MODEL_PATH || defaultModelPath,
  whisperOptions: {
    language: 'es',
    word_timestamps: false,
  },
};

async function transcribe(filePath) {
  const sourcePath = path.isAbsolute(filePath) ? filePath : path.join(originalCwd, filePath);
  let inputPath = filePath;
  let tempWavPath = null;

  try {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Файл не найден: ${sourcePath}`);
    }

    const ext = path.extname(sourcePath).toLowerCase();
    if (ext !== '.wav') {
      tempWavPath = path.join(os.tmpdir(), `whisper-${Date.now()}.wav`);
      console.log(`Конвертирую ${ext} -> wav 16kHz...`);

      const ffmpeg = spawnSync(
        'ffmpeg',
        ['-y', '-i', sourcePath, '-ar', '16000', '-ac', '1', tempWavPath],
        { stdio: 'pipe', encoding: 'utf8' },
      );

      if (ffmpeg.error) {
        throw new Error(`Не удалось запустить ffmpeg: ${ffmpeg.error.message}`);
      }

      if (ffmpeg.status !== 0) {
        throw new Error(`ffmpeg завершился с ошибкой:\n${ffmpeg.stderr || ffmpeg.stdout}`);
      }

      inputPath = tempWavPath;
    } else {
      inputPath = sourcePath;
    }

    console.log('Начинаю транскрибацию...');
    const transcript = await whisper(inputPath, options);

    if (!Array.isArray(transcript)) {
      throw new Error('whisper-node не вернул массив сегментов. Проверьте путь к модели и формат аудио (wav 16kHz).');
    }

    // Формируем текст для отправки в LM Studio
    const fullText = transcript.map((line) => line.speech).join(' ');
    console.log('Результат:', fullText);

    return fullText;
  } catch (err) {
    console.error('Ошибка:', err);
    throw err;
  } finally {
    if (tempWavPath && fs.existsSync(tempWavPath)) {
      fs.unlinkSync(tempWavPath);
    }
  }
}

module.exports = { transcribe };

if (require.main === module) {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Использование: node whisper.js <путь_к_audio.m4a>');
    process.exit(1);
  }

  transcribe(filePath).catch(() => {
    process.exit(1);
  });
}