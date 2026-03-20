package com.whisper.speech_to_text.controller;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.util.Base64;

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

    // Ollama runs locally on port 11434 by default
    private static final String OLLAMA_URL = "http://localhost:11434/api/generate";
    private static final String MODEL      = "dimavz/whisper-tiny";

    @PostMapping("/speech")
    public ResponseEntity<String> speechToText(@RequestParam("file") MultipartFile file) {

        File temp = null;

        try {
            // ── 1. Save uploaded audio to a temp file ──────────────────────
            String originalFilename = file.getOriginalFilename();
            String extension = (originalFilename != null && originalFilename.contains("."))
                    ? originalFilename.substring(originalFilename.lastIndexOf('.'))
                    : ".webm";

            temp = File.createTempFile("audio", extension);
            file.transferTo(temp);

            // ── 2. Base64-encode the audio bytes ───────────────────────────
            byte[] audioBytes = Files.readAllBytes(temp.toPath());
            String base64Audio = Base64.getEncoder().encodeToString(audioBytes);

            // ── 3. Build the Ollama JSON request body ──────────────────────
            //
            // dimavz/whisper-tiny accepts audio as a base64 string
            // passed inside the "images" array (same pattern Ollama uses
            // for multimodal models like llava).
            //
            String jsonBody = "{"
                + "\"model\": \"" + MODEL + "\","
                + "\"prompt\": \"Transcribe the audio.\","
                + "\"images\": [\"" + base64Audio + "\"],"
                + "\"stream\": false"
                + "}";

            // ── 4. POST to Ollama ──────────────────────────────────────────
            HttpClient client = HttpClient.newHttpClient();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OLLAMA_URL))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .build();

            HttpResponse<String> response =
                    client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                return ResponseEntity.internalServerError()
                        .body("Ollama error " + response.statusCode() + ": " + response.body());
            }

            // ── 5. Parse the response JSON ─────────────────────────────────
            // Ollama returns: {"model":"...","response":"transcribed text","done":true,...}
            // Simple parse without pulling in a JSON library:
            String body       = response.body();
            String transcript = extractJsonField(body, "response");

            if (transcript == null || transcript.isBlank()) {
                return ResponseEntity.ok("(no speech detected)");
            }

            return ResponseEntity.ok(transcript.trim());

        } catch (IOException | InterruptedException e) {
            String hint = "";
            if (e.getMessage() != null && e.getMessage().contains("Connection refused")) {
                hint = "\n\nOllama is not running. Start it with:\n  ollama serve\n"
                     + "Then verify the model is available:\n  ollama list";
            }
            return ResponseEntity.internalServerError()
                    .body("Error: " + e.getMessage() + hint);
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body("Error: " + e.getMessage());
        } finally {
            if (temp != null && temp.exists()) {
                temp.delete();
            }
        }
    }

    /**
     * Extracts the value of a JSON string field by key.
     * e.g. extractJsonField("{\"response\":\"hello world\"}", "response") → "hello world"
     *
     * Handles basic escaped characters. Avoids adding a JSON dependency.
     */
    private String extractJsonField(String json, String key) {
        String search = "\"" + key + "\"";
        int keyIdx = json.indexOf(search);
        if (keyIdx == -1) return null;

        int colon = json.indexOf(':', keyIdx + search.length());
        if (colon == -1) return null;

        // Skip whitespace after colon
        int start = colon + 1;
        while (start < json.length() && Character.isWhitespace(json.charAt(start))) start++;

        if (start >= json.length()) return null;

        if (json.charAt(start) == '"') {
            // String value — find the closing quote respecting escapes
            StringBuilder sb = new StringBuilder();
            int i = start + 1;
            while (i < json.length()) {
                char c = json.charAt(i);
                if (c == '\\' && i + 1 < json.length()) {
                    char next = json.charAt(i + 1);
                    switch (next) {
                        case '"':  sb.append('"');  i += 2; break;
                        case '\\': sb.append('\\'); i += 2; break;
                        case 'n':  sb.append('\n'); i += 2; break;
                        case 'r':  sb.append('\r'); i += 2; break;
                        case 't':  sb.append('\t'); i += 2; break;
                        default:   sb.append(next); i += 2; break;
                    }
                } else if (c == '"') {
                    break;
                } else {
                    sb.append(c);
                    i++;
                }
            }
            return sb.toString();
        }

        // Non-string value (number, bool, null) — read until comma or brace
        int end = start;
        while (end < json.length() && json.charAt(end) != ',' && json.charAt(end) != '}') end++;
        return json.substring(start, end).trim();
    }
}