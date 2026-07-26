import { Server, ServerChannel } from "ssh2";
import * as fs from "fs";
import * as readline from "readline";

const PORT = 2222;
const HOST_KEY_PATH = "./host_key";

if (!fs.existsSync(HOST_KEY_PATH)) {
  console.error(
    `Missing host key. Generate one first with:\n\n  ssh-keygen -t ed25519 -f host_key -N ""\n`,
  );
  process.exit(1);
}

const HOST_KEY = fs.readFileSync(HOST_KEY_PATH);

let activeChannel: ServerChannel | null = null;
let peerLabel: string | null = null;

function attachLineInput(
  stream: ServerChannel,
  prompt: string,
  onLine: (line: string) => void,
) {
  let buffer = "";

  stream.on("data", (data: Buffer) => {
    for (const byte of data) {
      if (byte === 13 || byte === 10) {
        // Enter
        stream.write("\r\n");
        const line = buffer;
        buffer = "";
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
        peerLabel = `${username}@${info.ip}`;
        console.log(`\n[+] Peer connected: ${peerLabel}`);
        process.stdout.write("You> ");

        channel.write(`Connected to host. Start typing to chat.\r\nYou: `);

        attachLineInput(channel, "You: ", (line) => {
          process.stdout.write(`\r${peerLabel}: ${line}\nYou> `);
        });

        channel.on("close", () => {
          console.log(`\n[-] Peer disconnected: ${peerLabel}`);
          process.stdout.write("You> ");
          peerLabel = null;
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
  process.stdout.write("You> ");
});

// Host's own keyboard input -> sent to whoever is connected
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line: string) => {
  if (activeChannel) {
    activeChannel.write(`Host: ${line}\r\nYou: `);
    process.stdout.write("You> ");
  } else {
    console.log("(no peer connected yet)");
    process.stdout.write("You> ");
  }
});
