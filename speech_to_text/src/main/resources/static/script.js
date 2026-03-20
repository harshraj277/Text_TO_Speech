// ── Startup check ─────────────────────────────────────────────────────────────
(function(){
    var proto = location.protocol;
    var isSecure = proto === 'https:' || proto === 'http:';
    if (!isSecure) {
      showInfo('⚠ Microphone requires a served page. Open this file via your Spring Boot server at <strong>http://localhost:8080</strong> — not by double-clicking the HTML file. File upload still works.');
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      showAlert('Mic API unavailable', 'Your browser does not support microphone recording. Try Chrome or Firefox served over HTTP/HTTPS.');
      document.getElementById('recBtn').disabled = true;
    }
  })();
   
  function showAlert(title, msg) {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMsg').textContent = ' ' + msg;
    document.getElementById('alertBox').classList.add('show');
  }
  function hideAlert() { document.getElementById('alertBox').classList.remove('show'); }
  function showInfo(html) {
    document.getElementById('infoMsg').innerHTML = html;
    document.getElementById('infoBanner').classList.add('show');
  }
   
  // ── Canvas ────────────────────────────────────────────────────────────────────
  var canvas = document.getElementById('waveCanvas');
  var ctx = canvas.getContext('2d');
   
  function resizeCanvas(){
    var dpr = window.devicePixelRatio||1;
    canvas.width  = canvas.offsetWidth  * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr,dpr);
  }
  resizeCanvas();
  window.addEventListener('resize', function(){ resizeCanvas(); drawIdle(); });
   
  function drawIdle(){
    var W=canvas.offsetWidth, H=canvas.offsetHeight;
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='#2a2a35'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
    for(var i=0;i<W;i+=18){
      var h=(i%72===0)?9:3;
      ctx.beginPath(); ctx.moveTo(i,H/2-h); ctx.lineTo(i,H/2+h); ctx.stroke();
    }
  }
  drawIdle();
   
  var analyser=null,audioCtx=null,animId=null;
   
  function startVisualizer(stream){
    try {
      audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      drawLive();
    } catch(e){ /* visualizer optional */ }
  }
   
  function drawLive(){
    if(!analyser) return;
    animId = requestAnimationFrame(drawLive);
    var W=canvas.offsetWidth, H=canvas.offsetHeight;
    var buf=new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(buf);
    ctx.clearRect(0,0,W,H);
    ctx.shadowColor='#f0a500'; ctx.shadowBlur=8;
    ctx.strokeStyle='#f0a500'; ctx.lineWidth=2;
    ctx.beginPath();
    for(var i=0;i<buf.length;i++){
      var x=(i/buf.length)*W, y=(buf[i]/128)*(H/2);
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.lineTo(W,H/2); ctx.stroke(); ctx.shadowBlur=0;
  }
   
  function stopVisualizer(){
    if(animId){cancelAnimationFrame(animId);animId=null;}
    if(audioCtx){audioCtx.close();audioCtx=null;}
    analyser=null; drawIdle();
  }
   
  var procId=null,procOff=0;
  function drawProcessing(){
    cancelAnimationFrame(procId);
    (function frame(){
      procOff+=2;
      var W=canvas.offsetWidth,H=canvas.offsetHeight;
      ctx.clearRect(0,0,W,H);
      for(var i=0;i<W+30;i+=18){
        var x=i-(procOff%18), h=6+Math.abs(Math.sin((i+procOff)*.08))*24;
        ctx.fillStyle='rgba(240,165,0,'+(0.1+Math.abs(Math.sin((i+procOff)*.05))*.3)+')';
        ctx.fillRect(x-5,H/2-h/2,9,h);
      }
      procId=requestAnimationFrame(frame);
    })();
  }
  function stopProcessing(){ cancelAnimationFrame(procId);procId=null; drawIdle(); }
   
  // ── Status ────────────────────────────────────────────────────────────────────
  function setSt(cls,txt){
    document.getElementById('dot').className='dot '+cls;
    document.getElementById('stTxt').textContent=txt;
  }
  function setViz(t){ document.getElementById('vizLbl').textContent=t; }
   
  // ── Recording ─────────────────────────────────────────────────────────────────
  var mediaRecorder=null, audioChunks=[], timerInterval=null, elapsed=0;
   
  async function toggleRecording(){
    if(mediaRecorder && mediaRecorder.state==='recording'){
      stopRecording();
    } else {
      await startRecording();
    }
  }
   
  async function startRecording(){
    hideAlert();
    clearOutput();
   
    // Check API availability
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      showAlert('Mic not available',
        'navigator.mediaDevices is undefined. This usually means the page was opened as a local file (file://). ' +
        'Serve it from Spring Boot: place index.html in src/main/resources/static/ and open http://localhost:8080');
      return;
    }
   
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioChunks = [];
   
      // Pick a supported MIME type
      var mimeType = '';
      var candidates = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
      for(var i=0;i<candidates.length;i++){
        if(MediaRecorder.isTypeSupported(candidates[i])){ mimeType=candidates[i]; break; }
      }
   
      mediaRecorder = mimeType ? new MediaRecorder(stream,{mimeType:mimeType}) : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function(e){ if(e.data && e.data.size>0) audioChunks.push(e.data); };
      mediaRecorder.onstop = onRecordStop;
      mediaRecorder.onerror = function(e){ showAlert('Recorder error', e.error ? e.error.message : String(e)); };
      mediaRecorder.start(100); // collect chunks every 100ms
   
      startVisualizer(stream);
      setSt('rec','RECORDING'); setViz('LIVE INPUT');
   
      var btn=document.getElementById('recBtn');
      btn.classList.add('is-rec');
      document.getElementById('recIco').textContent='■';
      document.getElementById('recLbl').textContent='STOP';
      document.getElementById('recSt').textContent='● REC';
   
      elapsed=0;
      document.getElementById('timer').style.display='block';
      timerInterval=setInterval(function(){
        elapsed++;
        var m=String(Math.floor(elapsed/60)).padStart(2,'0'), s=String(elapsed%60).padStart(2,'0');
        document.getElementById('timer').textContent=m+':'+s;
      },1000);
   
    } catch(e){
      var hint = '';
      if(e.name==='NotAllowedError'||e.name==='PermissionDeniedError'){
        hint = 'Microphone permission was denied. Click the 🔒 icon in your browser address bar and allow microphone access, then try again.';
      } else if(e.name==='NotFoundError'||e.name==='DevicesNotFoundError'){
        hint = 'No microphone found. Please connect a microphone and try again.';
      } else if(e.name==='NotReadableError'){
        hint = 'Microphone is in use by another application. Close other apps using the mic and try again.';
      } else if(e.name==='SecurityError'){
        hint = 'Blocked by browser security. Open this page from http://localhost:8080 instead of a local file path.';
      } else {
        hint = e.message || String(e);
      }
      showAlert(e.name || 'Mic Error', hint);
    }
  }
   
  function stopRecording(){
    if(mediaRecorder && mediaRecorder.state!=='inactive'){
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(function(t){t.stop();});
    }
    clearInterval(timerInterval);
    stopVisualizer();
    drawProcessing();
   
    var btn=document.getElementById('recBtn');
    btn.classList.remove('is-rec'); btn.classList.add('is-proc'); btn.disabled=true;
    document.getElementById('recIco').textContent='◌';
    document.getElementById('recLbl').textContent='PROCESSING…';
    document.getElementById('recSt').textContent='';
    document.getElementById('timer').style.display='none';
    setSt('proc','PROCESSING'); setViz('PROCESSING');
  }
   
  async function onRecordStop(){
    var mime = (mediaRecorder && mediaRecorder.mimeType) ? mediaRecorder.mimeType : 'audio/webm';
    var ext = mime.includes('ogg')?'.ogg':mime.includes('mp4')?'.mp4':'.webm';
    var blob = new Blob(audioChunks, {type:mime});
   
    if(blob.size === 0){
      showAlert('Empty recording','No audio data was captured. Please try again and speak into your microphone.');
      resetRecBtn(); stopProcessing(); return;
    }
   
    await sendBlob(blob, 'recording'+ext);
    resetRecBtn(); stopProcessing();
  }
   
  function resetRecBtn(){
    var btn=document.getElementById('recBtn');
    btn.classList.remove('is-proc'); btn.disabled=false;
    document.getElementById('recIco').textContent='●';
    document.getElementById('recLbl').textContent='RECORD';
  }
   
  // ── File upload ───────────────────────────────────────────────────────────────
  function onFileSelect(input){
    var drop=document.getElementById('fileDrop'), nm=document.getElementById('fileName');
    if(input.files.length){ nm.textContent=input.files[0].name; drop.classList.add('has-file'); }
    else { nm.textContent='BROWSE OR DROP'; drop.classList.remove('has-file'); }
  }
   
  async function uploadAudio(){
    var input=document.getElementById('audioFile');
    if(!input.files.length){ showAlert('No file','Select an audio file first.'); return; }
    hideAlert();
    var btn=document.getElementById('upBtn');
    btn.disabled=true; btn.textContent='PROCESSING…';
    setSt('proc','PROCESSING'); setViz('PROCESSING'); drawProcessing(); clearOutput();
    await sendBlob(input.files[0], input.files[0].name);
    btn.disabled=false; btn.textContent='TRANSCRIBE →'; stopProcessing();
  }
   
  // ── Send to backend ───────────────────────────────────────────────────────────
  async function sendBlob(blob, filename){
    var ta=document.getElementById('result');
    try{
      var fd=new FormData();
      fd.append('file', blob, filename);
      var res=await fetch('http://localhost:8080/api/speech',{method:'POST',body:fd});
      if(!res.ok) throw new Error('HTTP '+res.status+' — '+await res.text());
      var text=(await res.text()).trim();
      ta.value=text;
      updateChars(text.length);
      if(text) document.getElementById('copyBtn').style.display='inline-block';
      setSt('done','DONE'); setViz('COMPLETE');
    } catch(e){
      ta.value='ERROR: '+e.message+'\n\nMake sure Spring Boot is running on http://localhost:8080';
      setSt('err','ERROR'); setViz('ERROR');
      updateChars(0);
    }
  }
   
  // ── Utils ─────────────────────────────────────────────────────────────────────
  function clearOutput(){
    document.getElementById('result').value='';
    document.getElementById('copyBtn').style.display='none';
    updateChars(0);
  }
  function updateChars(n){ document.getElementById('chars').textContent=n+' chars'; }
  document.getElementById('result').addEventListener('input',function(){ updateChars(this.value.length); });
   
  function copyResult(){
    navigator.clipboard.writeText(document.getElementById('result').value).then(function(){
      var btn=document.getElementById('copyBtn');
      btn.textContent='✓ COPIED';
      setTimeout(function(){ btn.textContent='⧉ COPY'; },2000);
    });
  }
 