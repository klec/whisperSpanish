#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { transcribe } = require('./whisper');

const cliArgs = process.argv.slice(2);
const srcDir = cliArgs[0] || '/spanishResume/src';
const outDir = cliArgs[1] || '/spanishResume/resume';
const processingDir = cliArgs[2] || '/spanishResume/processed';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAEdF-Er7YDtUoKPscmak68XTD7Yt_U_CO';
const GEMINI_MODEL = 'gemini-2.5-flash';
const TRANSLATE_TO = 'ru';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function buildTimestampName() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const min = pad2(now.getMinutes());
  return `transcribe-${yyyy}-${mm}-${dd}_${hh}:${min}.txt`;
}

function getUniqueOutputPath(dirPath) {
  const baseName = buildTimestampName();
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);

  let candidate = path.join(dirPath, baseName);
  let index = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(dirPath, `${stem}-${index}${ext}`);
    index += 1;
  }

  return candidate;
}

function getUniqueAudioPath(dirPath, fileName) {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);

  let candidate = path.join(dirPath, fileName);
  let index = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(dirPath, `${stem}-${index}${ext}`);
    index += 1;
  }

  return candidate;
}

function moveFile(sourcePath, targetPath) {
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error) {
    if (error.code !== 'EXDEV') {
      throw error;
    }

    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getTranslationOutputPath(transcriptPath) {
  const ext = path.extname(transcriptPath);
  const stem = path.basename(transcriptPath, ext);
  return path.join(path.dirname(transcriptPath), `${stem}-translated${ext}`);
}

async function translateWithGemini(text) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is empty. Add your key in batch-transcribe.js');
  }

  const prompt = [
    `Translate the following text to ${TRANSLATE_TO}.`,
    'The input is an automatic speech recognition (ASR) transcript and may contain recognition errors, missing punctuation, and broken words.',
    'Before translating, lightly normalize obvious ASR mistakes only when the intended meaning is clear.',
    'If uncertain, preserve the original meaning as closely as possible and do not invent details.',
    'Return only the translated text without explanations.',
    '',
    text,
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini API request failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!translated) {
    throw new Error('Gemini API returned empty translation');
  }

  return translated.trim();
}

function listAudioFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(m4a|wav)$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  if (cliArgs[0] === '--translate-only') {
    const sampleText = cliArgs.slice(1).join(' ').trim() || 'Hola, como estas?';
    const translatedText = await translateWithGemini(sampleText);
    console.log('Gemini API OK. Translation result:');
    console.log(translatedText);
    return;
  }

  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source folder not found: ${srcDir}`);
  }

  ensureDir(outDir);
  ensureDir(processingDir);

  const files = listAudioFiles(srcDir);
  if (files.length === 0) {
    console.log(`No .m4a or .wav files found in: ${srcDir}`);
    return;
  }

  console.log(`Found ${files.length} audio file(s).`);

  let ok = 0;
  let failed = 0;

  for (const fileName of files) {
    const inputPath = path.join(srcDir, fileName);
    const processingPath = getUniqueAudioPath(processingDir, fileName);
    const outputPath = getUniqueOutputPath(outDir);
    const translatedOutputPath = getTranslationOutputPath(outputPath);

    console.log(`\n[${ok + failed + 1}/${files.length}] ${fileName}`);

    try {
      moveFile(inputPath, processingPath);
      console.log(`Moved to processing: ${processingPath}`);

      const text = await transcribe(processingPath);
      fs.writeFileSync(outputPath, `${text}\n`, 'utf8');

      const translatedText = await translateWithGemini(text);
      fs.writeFileSync(translatedOutputPath, `${translatedText}\n`, 'utf8');

      //fs.unlinkSync(processingPath);

      console.log(`Saved: ${outputPath}`);
      console.log(`Saved translation: ${translatedOutputPath}`);
      //console.log(`Deleted audio: ${processingPath}`);
      ok += 1;
    } catch (error) {
      console.error(`Failed: ${fileName}`);
      console.error(error.message || error);
      failed += 1;
    }
  }

  console.log(`\nDone. Success: ${ok}, Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message || error);
  process.exit(1);
});
