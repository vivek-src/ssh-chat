import { Server, ServerChannel } from "ssh2";
import * as fs from "fs";
import * as readline from "readline";

const PORT = 2222;
const HOST_KEY_PATH = "./host_key";

const hostName = process.argv[2] || "Host";

const COLOR_YOU = "\x1b[32m"; // Green
const COLOR_PEER = "\x1b[36m"; // Cyan
const COLOR_RESET = "\x1b[0m";

if (!fs.existsSync(HOST_KEY_PATH)) {
  console.error(
    `Missing host key. Generate one first with:\n\n  ssh-keygen -t ed25519 -f host_key -N ""\n`,
  );
  process.exit(1);
}

const HOST_KEY = fs.readFileSync(HOST_KEY_PATH);

let activeChannel: ServerChannel | null = null;
let peerName: string | null = null;

/** Formats the current time as HH:MM, e.g. "14:32". */
function timestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
function attachLineInput(
  stream: ServerChannel,
  prompt: string,
  onLine: (line: string) => void,
) {
  let buffer = "";

  stream.on("data", (data: Buffer) => {
    for (const byte of data) {
      if (byte === 13 || byte === 10) {
        // Enter: the line just typed is currently showing as "You: <buffer>"
        // via the character-echo above. Clear it and rewrite with a
        // timestamp before moving to the next line.
        const line = buffer;
        buffer = "";
        stream.write(`\r\x1b[K[${timestamp()}] ${COLOR_YOU}You:${COLOR_RESET} ${line}\r\n`);
        if (line.length > 0) onLine(line);
        stream.write(prompt);
      } else if (byte === 127 || byte === 8) {
        // Backspace/Delete
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          stream.write("\b \b");
        }
      } else if (byte === 3) {
        // Ctrl+C
        stream.end();
      } else if (byte >= 32 && byte < 127) {
        // Printable ASCII
        buffer += String.fromCharCode(byte);
        stream.write(Buffer.from([byte]));
      }
      // Other control bytes (arrow keys, etc.) are ignored for simplicity.
    }
  });
}

const server = new Server({ hostKeys: [HOST_KEY] }, (client, info) => {
  let username = "unknown";

  // NOTE: this accepts ANY auth attempt (password or none).
  // Fine for a quick personal two-PC chat on a trusted network.
  // Tighten this to check a specific public key before using it beyond that.
  client.on("authentication", (ctx) => {
    username = ctx.username;
    ctx.accept();
  });

  client.on("ready", () => {
    client.on("session", (accept) => {
      const session = accept();

      session.on("pty", (accept) => accept());

      session.on("shell", (accept) => {
        const channel = accept();

        if (activeChannel) {
          channel.write("A peer is already connected. Try again later.\r\n");
          channel.end();
          return;
        }

        activeChannel = channel;
        peerName = username;
        console.log(`\n[+] Peer connected: ${peerName}`);
        process.stdout.write(`${COLOR_YOU}You>${COLOR_RESET} `);

        channel.write(`Connected to ${hostName}. Start typing to chat.\r\n${COLOR_YOU}You:${COLOR_RESET} `);

        attachLineInput(channel, `${COLOR_YOU}You:${COLOR_RESET} `, (line) => {
          process.stdout.write(
            `\r[${timestamp()}] ${COLOR_PEER}${peerName}:${COLOR_RESET} ${line}\n${COLOR_YOU}You>${COLOR_RESET} `,
          );
        });

        channel.on("close", () => {
          console.log(`\n[-] Peer disconnected: ${peerName}`);
          process.stdout.write(`${COLOR_YOU}You>${COLOR_RESET} `);
          peerName = null;
          activeChannel = null;
        });
      });
    });
  });

  client.on("error", () => {
    /* swallow: a dropped peer connection shouldn't crash the host */
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SSH chat server listening on port ${PORT}`);
  console.log(`Peer connects with: ssh -p ${PORT} anyname@<this-PC-IP>\n`);
  process.stdout.write(`${COLOR_YOU}You>${COLOR_RESET} `);
});

// Host's own keyboard input -> sent to whoever is connected
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line: string) => {
  readline.moveCursor(process.stdout, 0, -1);
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`[${timestamp()}] ${COLOR_YOU}You:${COLOR_RESET} ${line}\n`);

  if (activeChannel) {
    activeChannel.write(`\r\x1b[K[${timestamp()}] ${COLOR_PEER}${hostName}:${COLOR_RESET} ${line}\r\n${COLOR_YOU}You:${COLOR_RESET} `);
    process.stdout.write(`${COLOR_YOU}You>${COLOR_RESET} `);
  } else {
    console.log("(no peer connected yet)");
    process.stdout.write(`${COLOR_YOU}You>${COLOR_RESET} `);
  }
});
