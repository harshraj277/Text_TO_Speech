# Text_TO_Speech
# 🎙️ Whisper Studio — Speech to Text

A local speech-to-text web app powered by **OpenAI Whisper** and **Spring Boot**.  
Record live from your mic or upload an audio file — transcription runs entirely on your machine, no cloud needed.

---

## 📁 Project Structure

```
speech_to_text/
├── src/
│   └── main/
│       ├── java/com/whisper/speech_to_text/
│       │   ├── SpeechToTextApplication.java   ← Spring Boot entry point
│       │   └── controller/
│       │       └── SpeechController.java       ← REST API endpoint
│       └── resources/
│           ├── static/
│           │   └── index.html                  ← Frontend UI
│           └── application.properties          ← Server config
└── pom.xml
```

---

## ⚙️ Prerequisites

### 1. Java 17+
Download from https://adoptium.net

### 2. Python 3.8+ and OpenAI Whisper
```bash
pip install openai-whisper
```
After installing, confirm it works:
```bash
whisper --help
```

> **Windows users:** If `whisper` is not found, find the full path with:
> ```cmd
> where whisper
> ```
> Example output: `C:\Users\YourName\AppData\Local\Programs\Python\Python311\Scripts\whisper.exe`  
> Paste this path into `SpeechController.java` in the `WHISPER_CANDIDATES` list.

### 3. FFmpeg (required by Whisper)
- **Windows:** Download from https://ffmpeg.org/download.html → add to PATH
- **Mac:** `brew install ffmpeg`
- **Linux:** `sudo apt install ffmpeg`

---

## 🚀 Getting Started

### Step 1 — Clone / open the project
Open the project in IntelliJ, Eclipse, or VS Code with the Spring Boot extension.

### Step 2 — Place the frontend
Make sure `index.html` is located at:
```
src/main/resources/static/index.html
```

### Step 3 — Run Spring Boot
```bash
./mvnw spring-boot:run
```
Or run `SpeechToTextApplication.java` directly from your IDE.

### Step 4 — Open the app
Visit in Chrome:
```
http://localhost:8080
```

> ⚠️ **Do NOT open `index.html` by double-clicking it.**  
> Chrome blocks microphone access on `file://` URLs.  
> Always use `http://localhost:8080`.

---

## 🎤 How to Use

### Live Microphone
1. Click **Record** — allow microphone permission when prompted
2. Speak clearly
3. Click **Stop** — audio is sent to the backend automatically
4. Transcription appears in the Output box

### File Upload
1. Click **Browse or Drop** and select any audio file (`.mp3`, `.wav`, `.webm`, `.m4a`, etc.)
2. Click **Transcribe →**
3. Transcription appears in the Output box

### Copy Result
Click **⧉ Copy** to copy the transcription to your clipboard.

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/speech` | Upload audio file, returns transcription text |

**Request:** `multipart/form-data` with field name `file`  
**Response:** Plain text transcription

**Example (curl):**
```bash
curl -X POST http://localhost:8080/api/speech \
  -F "file=@recording.webm"
```

---

## 🛠️ Configuration

`src/main/resources/application.properties`:

```properties
spring.application.name=speech_to_text
server.port=8080

# Max audio upload size
spring.servlet.multipart.max-file-size=20MB
spring.servlet.multipart.max-request-size=20MB
```

To change the port, update `server.port` and also update the fetch URL in `index.html`:
```javascript
fetch('http://localhost:YOUR_PORT/api/speech', ...)
```

---

## ❌ Common Errors & Fixes

### `Cannot run program "whisper": CreateProcess error=2`
Whisper is installed but Spring Boot can't find it.

**Fix:**
1. Run `where whisper` (Windows) or `which whisper` (Mac/Linux) in your terminal
2. Copy the full path
3. Add it to the top of `WHISPER_CANDIDATES` list in `SpeechController.java`
4. Restart Spring Boot

### `Mic not working / RECORD button does nothing`
The page is being opened as a local file.

**Fix:** Open `http://localhost:8080` in Chrome (not `file://...`)

### `HTTP 500` from backend
Check the Spring Boot console for the full error message. Common causes:
- Whisper not installed → `pip install openai-whisper`
- FFmpeg not installed → see Prerequisites above
- Audio file format not supported → try `.wav` or `.mp3`

### `CORS error` in browser console
Make sure `@CrossOrigin` is present on `SpeechController.java` (it is by default in this project).

---

## 🔧 Whisper Models

The controller uses the `base` model by default. You can change it in `SpeechController.java`:

```java
"--model", "base"   // change to: tiny, small, medium, large
```

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| tiny | 75 MB | Fastest | Low |
| base | 145 MB | Fast | Good |
| small | 466 MB | Medium | Better |
| medium | 1.5 GB | Slow | High |
| large | 3 GB | Slowest | Best |

First run will auto-download the model (~145 MB for base).

---

## 📦 Dependencies

**Backend (Maven)**
- Spring Boot 3.x
- Spring Web
- Spring Boot DevTools

**Frontend**
- Vanilla HTML / CSS / JavaScript (no frameworks, no npm)

**System**
- Python 3.8+ with `openai-whisper`
- FFmpeg

---

## 📄 License

MIT — free to use and modify.
