# How to use

```bash
mkdir -p ~/spanishResume/src ~/spanishResume/resume ~/spanishResume/processed
docker compose build
docker compose run whisper
```

# Processing flow
1) file is moved from ~/spanishResume/src to ~/spanishResume/processed
2) after successful transcription, text is saved in ~/spanishResume/resume
3) translate text result using gemini-2.5-flash
