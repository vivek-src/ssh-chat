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

        stream.on("data", (data: Buffer) => {
          const msg = data.toString().replace(/\r?\n/g, "");
          if (msg.length === 0) return;
          process.stdout.write(`\rPeer: ${msg}\nYou> `);
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
