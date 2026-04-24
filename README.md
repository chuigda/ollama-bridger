# ollama-bridger

A small Ollama-compatible proxy server that forwards chat requests to OpenAI-compatible upstream providers.

## Quick start

1. Copy `config.example.json` to `config.json`.
2. Update `config.json` with your provider base URL and API key.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npx tsx src/index.ts
   ```

## Endpoints

- `GET /` — health check
- `GET /api/version` — proxy version
- `GET /api/tags` — Ollama model list
- `POST /api/show` — model details
- `POST /v1/chat/completions` — OpenAI-compatible chat endpoint
- `POST /api/chat` — Ollama-style chat endpoint

## Config format

```json
{
  "host": "127.0.0.1",
  "port": 11434,
  "providers": [
    {
      "name": "deepseek",
      "baseURL": "https://api.deepseek.com/v1",
      "apiKey": "YOUR_API_KEY",
      "models": [
        {
          "id": "deepseek-v4",
          "alias": "deepseek-v4:latest",
          "supportsVision": false,
          "supportsTools": true,
          "supportsReasoning": true
        }
      ]
    }
  ]
}
```
