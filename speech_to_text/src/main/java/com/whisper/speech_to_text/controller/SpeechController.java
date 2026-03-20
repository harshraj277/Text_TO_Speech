package com.whisper.speech_to_text.controller;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
@CrossOrigin("*")
public class SpeechController {

    @PostMapping("/speech")
    public ResponseEntity<String> speechToText(@RequestParam("file") MultipartFile file) {

        File temp = null;
        try {
            String originalFilename = file.getOriginalFilename();
            String extension = (originalFilename != null && originalFilename.contains("."))
                    ? originalFilename.substring(originalFilename.lastIndexOf('.'))
                    : ".webm"; // browsers default to webm

            temp = File.createTempFile("audio", extension);
            file.transferTo(temp);

            File outputDir = temp.getParentFile();

            ProcessBuilder pb = new ProcessBuilder(
                    "whisper",
                    temp.getAbsolutePath(),
                    "--model", "base",
                    "--output_format", "txt",
                    "--output_dir", outputDir.getAbsolutePath()
            );

            pb.redirectErrorStream(true);
            Process process = pb.start();

            // Read stdout/stderr while process runs
            BufferedReader reader =
                    new BufferedReader(new InputStreamReader(process.getInputStream()));

            StringBuilder logs = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                logs.append(line).append("\n");
            }

            int exitCode = process.waitFor();

            if (exitCode != 0) {
                return ResponseEntity.internalServerError()
                        .body("Whisper exited with code " + exitCode + ":\n" + logs);
            }

            String baseName = temp.getName().substring(0, temp.getName().lastIndexOf('.'));
            File txtFile = new File(outputDir, baseName + ".txt");

            String transcription;
            if (txtFile.exists()) {
                transcription = new String(java.nio.file.Files.readAllBytes(txtFile.toPath())).trim();
                txtFile.delete();
            } else {
                // Fallback: return logs which may contain the transcription
                transcription = logs.toString().trim();
            }

            return ResponseEntity.ok(transcription);

        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body("Error: " + e.getMessage());
        } finally {
            if (temp != null && temp.exists()) {
                temp.delete();
            }
        }
    }
}