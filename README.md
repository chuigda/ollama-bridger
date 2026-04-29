# ollama-bridger

一个轻量的 Ollama 兼容代理服务器，将请求转发到任意 OpenAI 兼容的上游 API。100% Vibe Coded!

Alternative: https://github.com/JohnnyZ93/oai-compatible-copilot

## 为什么会有这个项目？

GitHub Copilot Pro/Pro+ 订阅[已经成为一条臭蛆](https://github.com/orgs/community/discussions/192963/)。

与此同时，GitHub Copilot 的 BYOK（Bring Your Own Key）功能目前只支持 Ollama 作为自定义模型提供方。如果你想通过 OpenAI API 接入自己的套壳站，Copilot 不给你这个选项——你只能走 Ollama。

所以这个项目的作用就是：假装自己是一个 Ollama 实例，把 Copilot 发来的请求翻译后转发给你真正想用的 API 后端。

## 快速开始

1. 复制 `config.example.json` 为 `config.json`。
2. 在 `config.json` 中填入你的 API 地址和密钥。
3. 安装依赖：
   ```bash
   npm install
   ```
4. 启动服务：
   ```bash
   npx tsx src/index.ts
   ```

服务默认监听 `127.0.0.1:11434`，与 Ollama 默认端口一致，Copilot 可以直接连接。

## 接口

- `GET /` — 健康检查
- `GET /api/version` — 版本信息
- `GET /api/tags` — Ollama 模型列表
- `GET /v1/models` — OpenAI 风格模型列表
- `POST /api/show` — 模型详情
- `POST /v1/chat/completions` — OpenAI 兼容聊天接口

## 配置格式

```json
{
  "host": "127.0.0.1",
  "port": 11434,
  "providers": [
    {
      "name": "vendor",
      "baseURL": "https://api.vendor.com/v1",
      "apiKey": "YOUR_API_KEY",
      "defaultHeaders": {},
      "models": [
        {
          "id": "gemini-3.1-pro-preview",
          "alias": "gemini-3.1-pro-preview",
          "supportsVision": true,
          "supportsTools": true,
          "supportsReasoning": true,
          "contextLength": 192000
        }
      ]
    }
  ]
}
```

## 已知问题

- DeepSeek v4 思考模式在调用工具之后，会显示 400，提示需要 reasoning content。尚不了解成因，但问题可能在 Copilot 插件一侧。
- Copilot 插件一侧无法正常显示已消耗的上下文窗口，原因目前不明。

## 许可

MIT
