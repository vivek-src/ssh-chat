# SSH P2P Chat

## Overview
A minimal, peer-to-peer terminal chat application built over SSH using Node.js. It facilitates direct point-to-point communication over a secure SSH tunnel without relying on an intermediary server. The application includes native integration with local Large Language Models (LLMs) via the Ollama API, allowing both peers to execute inference directly within the chat stream.

## Architecture
- **Protocol**: SSH (via `ssh2` package)
- **Runtime**: Node.js, TypeScript
- **Concurrency**: Single peer connection supported simultaneously to ensure strict 1-to-1 P2P routing.
- **I/O Handling**:
  - Host relies on Node's `readline` interface for robust TTY input handling.
  - Peer inputs are processed via raw TCP stream byte-parsing to support backspace and control sequences gracefully.
- **Formatting**: Strict ANSI escape code implementation for non-destructive carriage returns (`\r\x1b[K`) and standardized color coding.

## Features
- **P2P SSH Chat**: Direct connection architecture using an Ed25519 host key.
- **Dynamic Model Inference**: `/ollama <prompt>` invokes a REST call to `127.0.0.1:11434`. Models are dynamically auto-selected via the `/api/tags` endpoint.
- **Customizable Host Identity**: Overridable host display name via command-line execution parameters.
- **Color-Coded Streams**: Dedicated terminal colors distinguishing between local input, remote input, and LLM inference.

## Installation and Setup

### Prerequisites
- Node.js (v18 or higher recommended for native Fetch API support)
- Ollama (optional, required for local LLM features)

### Building
```bash
npm install
npm run build
```

### Key Generation
Before initiating the server, generate an Ed25519 host key in the project root:
```bash
ssh-keygen -t ed25519 -f host_key -N ""
```

## Usage

### Host Execution
Initiate the server process. Optionally, append a custom display name as a process argument. The server defaults to port 2222.
```bash
npm run start [CustomName]
```

### Peer Connection
A peer can connect via standard SSH tools. Authentication accepts arbitrary usernames as this implementation is designed for trusted local-network interactions.
```bash
ssh -p 2222 anyname@<host-ip>
```

## Integrated Commands
- `/ollama <prompt>`: Dispatches the prompt to the host's local Ollama instance and streams the response back to both the host and peer outputs.
