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

let activeStream: ServerChannel | null = null;

function attachLineInput(
  stream: ServerChannel,
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

const server = new Server({ hostKeys: [HOST_KEY] }, (client) => {
  console.log("[+] Incoming connection...");

  // NOTE: this accepts ANY auth attempt (password or none).
  // Fine for a quick personal two-PC chat on a trusted network.
  // Tighten this to check a specific public key before using it beyond that.
  client.on("authentication", (ctx) => ctx.accept());

  client.on("ready", () => {
    console.log("[+] Peer authenticated.");

    client.on("session", (accept) => {
      const session = accept();

      session.on("pty", (accept) => accept());

      session.on("shell", (accept) => {
        const stream = accept();
        activeStream = stream;

        stream.write("Connected. Start typing to chat.\r\n> ");

        attachLineInput(stream, (line) => {
          process.stdout.write(`\rPeer: ${line}\nYou> `);
        });

        stream.on("close", () => {
          console.log("[-] Peer disconnected.");
          activeStream = null;
        });
      });
    });
  });

  client.on("close", () => console.log("[-] Connection closed."));
  client.on("error", (err: Error) =>
    console.log("[!] Client error:", err.message),
  );
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SSH chat server listening on port ${PORT}`);
  console.log(`Peer connects with: ssh -p ${PORT} anyname@<this-PC-IP>\n`);
  process.stdout.write("You> ");
});

// Host's own keyboard input -> sent to whoever is connected
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line: string) => {
  if (activeStream) {
    activeStream.write(`${line}\r\n> `);
    process.stdout.write("You> ");
  } else {
    console.log("(no peer connected yet)");
    process.stdout.write("You> ");
  }
});
