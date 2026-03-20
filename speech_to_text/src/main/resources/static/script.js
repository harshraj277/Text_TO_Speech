// ─── State ───────────────────────────────────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let timerInterval = null;
let secondsElapsed = 0;
let analyser = null;
let animFrameId = null;
let audioCtx = null;

// ─── Waveform Visualizer ──────────────────────────────────────────────────────
const canvas = document.getElementById("waveCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function drawIdle() {
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#2a2a35";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Static tick marks
    for (let i = 0; i < W; i += 20) {
        const h = (i % 80 === 0) ? 10 : 4;
        ctx.strokeStyle = "#2a2a35";
        ctx.beginPath();
        ctx.moveTo(i, H / 2 - h);
        ctx.lineTo(i, H / 2 + h);
        ctx.stroke();
    }
}
drawIdle();

function drawWave() {
    if (!analyser) return;
    animFrameId = requestAnimationFrame(drawWave);

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const bufLen = analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(dataArr);

    ctx.clearRect(0, 0, W, H);

    // Glow effect
    ctx.shadowColor = "#f0a500";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#f0a500";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceW = W / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
        const v = dataArr[i] / 128.0;
        const y = (v * H) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceW;
    }
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function startVisualizer(stream) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    drawWave();
}

function stopVisualizer() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (audioCtx) audioCtx.close();
    analyser = null;
    drawIdle();
}

// ─── Status Helpers ───────────────────────────────────────────────────────────
function setGlobalStatus(state, text) {
    const el = document.getElementById("globalStatus");
    el.className = "status-indicator " + state;
    el.querySelector(".status-text").textContent = text;
}

function setVizLabel(text) {
    document.getElementById("vizLabel").textContent = text;
}

// ─── Live Mic Recording ───────────────────────────────────────────────────────
async function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    clearResult();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];

        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = handleRecordingStop;
        mediaRecorder.start();

        startVisualizer(stream);

        // Update UI
        const btn = document.getElementById("recordBtn");
        btn.textContent = "";
        const icon = document.createElement("span");
        icon.id = "recordIcon";
        icon.className = "record-icon";
        icon.textContent = "■";
        const label = document.createElement("span");
        label.textContent = "STOP";
        btn.appendChild(icon);
        btn.appendChild(label);
        btn.classList.add("recording");

        setGlobalStatus("recording", "RECORDING");
        setVizLabel("LIVE");

        document.getElementById("recordingStatus").textContent = "REC";
        document.getElementById("timer").classList.remove("hidden");

        secondsElapsed = 0;
        timerInterval = setInterval(() => {
            secondsElapsed++;
            const m = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
            const s = String(secondsElapsed % 60).padStart(2, "0");
            document.getElementById("timer").textContent = `${m}:${s}`;
        }, 1000);

    } catch (err) {
        alert("Microphone access denied or unavailable: " + err.message);
    }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(timerInterval);
    stopVisualizer();

    const btn = document.getElementById("recordBtn");
    btn.innerHTML = `<span class="record-icon">◌</span><span>PROCESSING…</span>`;
    btn.classList.remove("recording");
    btn.classList.add("processing");
    btn.disabled = true;

    setGlobalStatus("processing", "PROCESSING");
    setVizLabel("PROCESSING");
    document.getElementById("recordingStatus").textContent = "";
}

async function handleRecordingStop() {
    // FIX: Use the actual MIME type from the MediaRecorder, not hardcoded WAV
    const mimeType = mediaRecorder.mimeType || "audio/webm";
    const extension = mimeType.includes("ogg") ? ".ogg"
                    : mimeType.includes("mp4") ? ".mp4"
                    : ".webm";
    const blob = new Blob(audioChunks, { type: mimeType });
    await sendAudioBlob(blob, "recording" + extension);

    // Reset record button
    const btn = document.getElementById("recordBtn");
    btn.innerHTML = `<span class="record-icon">●</span><span>RECORD</span>`;
    btn.classList.remove("processing");
    btn.disabled = false;
}

// ─── File Upload ──────────────────────────────────────────────────────────────
function onFileSelect(input) {
    const label = document.querySelector(".file-label");
    const display = document.getElementById("fileNameDisplay");
    if (input.files.length) {
        display.textContent = input.files[0].name;
        label.classList.add("has-file");
    } else {
        display.textContent = "DROP / BROWSE";
        label.classList.remove("has-file");
    }
}

async function uploadAudio() {
    const fileInput = document.getElementById("audioFile");
    if (!fileInput.files.length) {
        alert("Select an audio file first.");
        return;
    }
    const file = fileInput.files[0];
    const uploadBtn = document.getElementById("uploadBtn");
    uploadBtn.disabled = true;
    uploadBtn.textContent = "PROCESSING…";
    setGlobalStatus("processing", "PROCESSING");
    setVizLabel("PROCESSING");

    // Animate canvas during processing
    drawProcessing();

    await sendAudioBlob(file, file.name);

    uploadBtn.disabled = false;
    uploadBtn.textContent = "TRANSCRIBE →";
    stopProcessing();
}

// ─── Shared: Send to Backend ──────────────────────────────────────────────────
async function sendAudioBlob(blob, filename) {
    const resultArea = document.getElementById("result");
    resultArea.value = "";
    updateCharCount(0);

    try {
        const formData = new FormData();
        formData.append("file", blob, filename);

        const response = await fetch("http://localhost:8080/api/speech", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }

        const text = await response.text();
        const trimmed = text.trim();
        resultArea.value = trimmed;
        updateCharCount(trimmed.length);
        setGlobalStatus("done", "DONE");
        setVizLabel("COMPLETE");

        if (trimmed) {
            document.getElementById("copyBtn").style.display = "inline-block";
        }

    } catch (err) {
        resultArea.value = `ERROR: ${err.message}\n\nEnsure Spring Boot backend is running on http://localhost:8080`;
        setGlobalStatus("", "ERROR");
        setVizLabel("ERROR");
    } finally {
        document.getElementById("timer").classList.add("hidden");
        document.getElementById("recordingStatus").textContent = "";
    }
}

// ─── Processing Canvas Animation ─────────────────────────────────────────────
let procFrame = null;
let procOffset = 0;

function drawProcessing() {
    cancelAnimationFrame(procFrame);
    function frame() {
        procOffset += 2;
        const W = canvas.offsetWidth;
        const H = canvas.offsetHeight;
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < W + 60; i += 20) {
            const x = (i - procOffset % 20);
            const h = 8 + Math.sin((i + procOffset) * 0.1) * 20;
            ctx.fillStyle = `rgba(240,165,0,${0.15 + Math.abs(Math.sin((i + procOffset) * 0.05)) * 0.3})`;
            ctx.fillRect(x - 6, H / 2 - h / 2, 10, h);
        }
        procFrame = requestAnimationFrame(frame);
    }
    frame();
}

function stopProcessing() {
    cancelAnimationFrame(procFrame);
    drawIdle();
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function clearResult() {
    document.getElementById("result").value = "";
    document.getElementById("copyBtn").style.display = "none";
    updateCharCount(0);
}

function updateCharCount(n) {
    document.getElementById("charCount").textContent = n + " chars";
}

document.getElementById("result").addEventListener("input", function () {
    updateCharCount(this.value.length);
});

function copyResult() {
    const text = document.getElementById("result").value;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById("copyBtn");
        const orig = btn.textContent;
        btn.textContent = "✓ COPIED";
        setTimeout(() => btn.textContent = orig, 2000);
    });
}