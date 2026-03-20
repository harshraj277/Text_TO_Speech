package com.whisper.speech_to_text.controller;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
@CrossOrigin
public class SpeechController {

    /**
     * Common locations where whisper (openai-whisper) gets installed on Windows.
     * Python pip installs scripts into the Scripts folder of whichever Python is active.
     */
    private static final List<String> WHISPER_CANDIDATES = Arrays.asList(
        // Try plain name first (works if it's on PATH)
        "whisper",
        // Common Windows Python/pip install locations
        System.getProperty("user.home") + "\\AppData\\Local\\Programs\\Python\\Python312\\Scripts\\whisper.exe",
        System.getProperty("user.home") + "\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\whisper.exe",
        System.getProperty("user.home") + "\\AppData\\Local\\Programs\\Python\\Python310\\Scripts\\whisper.exe",
        System.getProperty("user.home") + "\\AppData\\Roaming\\Python\\Python312\\Scripts\\whisper.exe",
        System.getProperty("user.home") + "\\AppData\\Roaming\\Python\\Python311\\Scripts\\whisper.exe",
        System.getProperty("user.home") + "\\AppData\\Roaming\\Python\\Python310\\Scripts\\whisper.exe",
        // Conda / Anaconda
        System.getProperty("user.home") + "\\anaconda3\\Scripts\\whisper.exe",
        System.getProperty("user.home") + "\\miniconda3\\Scripts\\whisper.exe",
        "C:\\ProgramData\\anaconda3\\Scripts\\whisper.exe",
        "C:\\ProgramData\\miniconda3\\Scripts\\whisper.exe",
        // Mac / Linux fallbacks
        "/usr/local/bin/whisper",
        "/usr/bin/whisper",
        System.getProperty("user.home") + "/.local/bin/whisper"
    );

    private String findWhisper() {
        for (String candidate : WHISPER_CANDIDATES) {
            if (candidate.equals("whisper")) {
                // Test if it resolves on PATH by trying `where whisper` (Windows) or `which whisper` (Unix)
                try {
                    boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");
                    ProcessBuilder pb = isWindows
                        ? new ProcessBuilder("where", "whisper")
                        : new ProcessBuilder("which", "whisper");
                    pb.redirectErrorStream(true);
                    Process p = pb.start();
                    BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
                    String line = br.readLine();
                    p.waitFor();
                    if (line != null && !line.isEmpty()) {
                        return line.trim(); // full path found via PATH
                    }
                } catch (Exception ignored) {}
            } else {
                File f = new File(candidate);
                if (f.exists() && f.canExecute()) {
                    return candidate;
                }
            }
        }
        return null;
    }

    @PostMapping("/speech")
    public ResponseEntity<String> speechToText(@RequestParam("file") MultipartFile file) {

        // 1. Find whisper executable
        String whisperPath = findWhisper();
        if (whisperPath == null) {
            return ResponseEntity.internalServerError().body(
                "whisper not found.\n\n" +
                "Install it with:\n  pip install openai-whisper\n\n" +
                "Then restart Spring Boot. If already installed, run this in cmd and paste the output:\n  where whisper"
            );
        }

        File temp = null;
        try {
            // 2. Save uploaded file with correct extension
            String original = file.getOriginalFilename();
            String ext = (original != null && original.contains("."))
                ? original.substring(original.lastIndexOf('.'))
                : ".webm";
            temp = File.createTempFile("audio_", ext);
            file.transferTo(temp);

            // 3. Run whisper
            File outputDir = temp.getParentFile();
            ProcessBuilder pb = new ProcessBuilder(
                whisperPath,
                temp.getAbsolutePath(),
                "--model", "base",
                "--output_format", "txt",
                "--output_dir", outputDir.getAbsolutePath()
            );
            pb.redirectErrorStream(true);
            pb.environment().put("PYTHONIOENCODING", "utf-8");

            Process process = pb.start();

            // Read output while process runs (prevents buffer deadlock)
            StringBuilder logs = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    logs.append(line).append("\n");
                }
            }

            int exitCode = process.waitFor();

            if (exitCode != 0) {
                return ResponseEntity.internalServerError()
                    .body("Whisper failed (exit " + exitCode + "):\n" + logs.toString());
            }

            // 4. Read the .txt output file whisper creates
            String baseName = temp.getName().substring(0, temp.getName().lastIndexOf('.'));
            File txtFile = new File(outputDir, baseName + ".txt");

            String transcription;
            if (txtFile.exists()) {
                transcription = new String(Files.readAllBytes(txtFile.toPath()), "UTF-8").trim();
                txtFile.delete();
            } else {
                // Whisper sometimes prints transcript to stdout — use that
                transcription = logs.toString().trim();
            }

            return ResponseEntity.ok(transcription.isEmpty() ? "(No speech detected)" : transcription);

        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                .body("Error: " + e.getMessage());
        } finally {
            if (temp != null && temp.exists()) temp.delete();
        }
    }
}