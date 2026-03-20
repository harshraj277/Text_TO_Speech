/* ── Startup checks ── */
(function () {
    if (location.protocol === 'file:') {
      showInfo('Microphone requires HTTP. Place this file in <b>src/main/resources/static/</b> and open <b>http://localhost:8080</b> — File upload works from any location.');
    }
    if (!window.MediaRecorder || !navigator.mediaDevices) {
      showAlert('Mic unavailable', 'Your browser does not support audio recording. Use Chrome on http://localhost:8080.');
      document.getElementById('recBtn').disabled = true;
    }
  })();
  
  function showAlert(t, m) {
    document.getElementById('alertTitle').textContent = t + ': ';
    document.getElementById('alertMsg').textContent = m;
    document.getElementById('alertBox').classList.add('show');
  }
  function hideAlert() { document.getElementById('alertBox').classList.remove('show'); }
  function showInfo(h) {
    document.getElementById('infoMsg').innerHTML = h;
    document.getElementById('infoBox').classList.add('show');
  }
  
  /* ── Canvas ── */
  var cv  = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  
  function resize() {
    var dpr = window.devicePixelRatio || 1;
    cv.width  = cv.offsetWidth  * dpr;
    cv.height = cv.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', function () { resize(); idle(); });
  
  function idle() {
    var W = cv.offsetWidth, H = cv.offsetHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#2e2e3e';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    for (var i = 0; i < W; i += 16) {
      var h = i % 64 === 0 ? 8 : 3;
      ctx.beginPath(); ctx.moveTo(i, H / 2 - h); ctx.lineTo(i, H / 2 + h); ctx.stroke();
    }
  }
  idle();
  
  var analyser = null, audioCtx = null, animId = null;
  
  function startViz(stream) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      liveDraw();
    } catch (e) {}
  }
  
  function liveDraw() {
    if (!analyser) return;
    animId = requestAnimationFrame(liveDraw);
    var W = cv.offsetWidth, H = cv.offsetHeight;
    var b = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(b);
    ctx.clearRect(0, 0, W, H);
    ctx.shadowColor = '#f5a623'; ctx.shadowBlur = 8;
    ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < b.length; i++) {
      var x = (i / b.length) * W, y = (b[i] / 128) * (H / 2);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.lineTo(W, H / 2); ctx.stroke(); ctx.shadowBlur = 0;
  }
  
  function stopViz() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    analyser = null;
    idle();
  }
  
  var procId = null, pOff = 0;
  
  function procDraw() {
    cancelAnimationFrame(procId);
    (function f() {
      pOff += 2;
      var W = cv.offsetWidth, H = cv.offsetHeight;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < W + 30; i += 16) {
        var x = i - (pOff % 16), h = 5 + Math.abs(Math.sin((i + pOff) * .07)) * 22;
        ctx.fillStyle = 'rgba(245,166,35,' + (0.08 + Math.abs(Math.sin((i + pOff) * .05)) * .28) + ')';
        ctx.fillRect(x - 4, H / 2 - h / 2, 8, h);
      }
      procId = requestAnimationFrame(f);
    })();
  }
  
  function stopProc() { cancelAnimationFrame(procId); procId = null; idle(); }
  
  /* ── Status ── */
  function setSt(cls, t) {
    document.getElementById('dot').className = 'dot ' + cls;
    document.getElementById('stTxt').textContent = t;
  }
  function setViz(t) { document.getElementById('vizLbl').textContent = t; }
  
  /* ── Recording ── */
  var mr = null, chunks = [], tInt = null, sec = 0;
  
  async function toggleRec() {
    if (mr && mr.state === 'recording') stopRec();
    else await startRec();
  }
  
  async function startRec() {
    hideAlert(); clearOut();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showAlert('Blocked', 'Open the page from http://localhost:8080 — mic is blocked on file:// URLs.');
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      chunks = [];
  
      var mime = '';
      ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].forEach(function (m) {
        if (!mime && MediaRecorder.isTypeSupported(m)) mime = m;
      });
  
      mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mr.ondataavailable = function (e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
      mr.onstop = onStop;
      mr.onerror = function (e) { showAlert('Recorder error', e.error ? e.error.message : String(e)); };
      mr.start(100);
  
      startViz(stream);
      setSt('rec', 'RECORDING'); setViz('LIVE INPUT');
  
      var btn = document.getElementById('recBtn');
      btn.classList.add('is-rec');
      document.getElementById('recIco').textContent = '■';
      document.getElementById('recLbl').textContent = 'Stop';
      document.getElementById('recSt').textContent  = '● REC';
  
      sec = 0;
      document.getElementById('timer').style.display = 'block';
      tInt = setInterval(function () {
        sec++;
        var m = String(Math.floor(sec / 60)).padStart(2, '0');
        var s = String(sec % 60).padStart(2, '0');
        document.getElementById('timer').textContent = m + ':' + s;
      }, 1000);
  
    } catch (e) {
      var msg =
        e.name === 'NotAllowedError'  ? 'Permission denied — click the 🔒 in the address bar and allow microphone.' :
        e.name === 'NotFoundError'    ? 'No microphone detected. Plug one in and retry.' :
        e.name === 'NotReadableError' ? 'Microphone is in use by another app. Close it and retry.' :
        e.name === 'SecurityError'    ? 'Blocked by browser. Serve from http://localhost:8080.' :
        (e.message || String(e));
      showAlert(e.name || 'Mic Error', msg);
    }
  }
  
  function stopRec() {
    if (mr && mr.state !== 'inactive') {
      mr.stop();
      mr.stream.getTracks().forEach(function (t) { t.stop(); });
    }
    clearInterval(tInt);
    stopViz();
    procDraw();
  
    var btn = document.getElementById('recBtn');
    btn.classList.remove('is-rec');
    btn.classList.add('is-proc');
    btn.disabled = true;
    document.getElementById('recIco').textContent = '◌';
    document.getElementById('recLbl').textContent = 'Processing…';
    document.getElementById('recSt').textContent  = '';
    document.getElementById('timer').style.display = 'none';
    setSt('proc', 'PROCESSING'); setViz('PROCESSING');
  }
  
  async function onStop() {
    var mime = mr && mr.mimeType ? mr.mimeType : 'audio/webm';
    var ext  = mime.includes('ogg') ? '.ogg' : mime.includes('mp4') ? '.mp4' : '.webm';
    var blob = new Blob(chunks, { type: mime });
  
    if (!blob.size) {
      showAlert('Empty recording', 'No audio captured. Try again.');
      resetBtn(); stopProc();
      return;
    }
    await send(blob, 'recording' + ext);
    resetBtn(); stopProc();
  }
  
  function resetBtn() {
    var btn = document.getElementById('recBtn');
    btn.classList.remove('is-proc');
    btn.disabled = false;
    document.getElementById('recIco').textContent = '●';
    document.getElementById('recLbl').textContent = 'Record';
  }
  
  /* ── File Upload ── */
  function onFileSel(input) {
    var d = document.getElementById('fileDrop');
    var n = document.getElementById('fileName');
    if (input.files.length) {
      n.textContent = input.files[0].name;
      d.classList.add('has');
    } else {
      n.textContent = 'Browse or Drop';
      d.classList.remove('has');
    }
  }
  
  async function uploadAudio() {
    var inp = document.getElementById('audioFile');
    if (!inp.files.length) { showAlert('No file', 'Select an audio file first.'); return; }
    hideAlert();
    var btn = document.getElementById('upBtn');
    btn.disabled = true; btn.textContent = 'Processing…';
    setSt('proc', 'PROCESSING'); setViz('PROCESSING'); procDraw(); clearOut();
    await send(inp.files[0], inp.files[0].name);
    btn.disabled = false; btn.textContent = 'Transcribe →';
    stopProc();
  }
  
  /* ── Send to backend ── */
  async function send(blob, name) {
    var ta = document.getElementById('result');
    try {
      var fd = new FormData();
      fd.append('file', blob, name);
      var r = await fetch('http://localhost:8080/api/speech', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + await r.text());
      var t = (await r.text()).trim();
      ta.value = t;
      updateChars(t.length);
      if (t) document.getElementById('copyBtn').style.display = 'inline-block';
      setSt('done', 'DONE'); setViz('COMPLETE');
    } catch (e) {
      ta.value = 'ERROR: ' + e.message + '\n\nMake sure Spring Boot is running on http://localhost:8080';
      setSt('err', 'ERROR'); setViz('ERROR');
      updateChars(0);
    }
  }
  
  /* ── Utils ── */
  function clearOut() {
    document.getElementById('result').value = '';
    document.getElementById('copyBtn').style.display = 'none';
    updateChars(0);
  }
  
  function updateChars(n) {
    document.getElementById('chars').textContent = n + ' chars';
  }
  
  document.getElementById('result').addEventListener('input', function () {
    updateChars(this.value.length);
  });
  
  function copyRes() {
    navigator.clipboard.writeText(document.getElementById('result').value).then(function () {
      var b = document.getElementById('copyBtn');
      b.textContent = '✓ Copied';
      setTimeout(function () { b.textContent = '⧉ Copy'; }, 2000);
    });
  }