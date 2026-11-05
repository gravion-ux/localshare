const EMAIL_RE = /^[^\s@*]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_DOMAIN_RE = /^\*@(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const HOST_RE = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

export function parseArgs(argv) {
  const result = {
    mode: "quick", port: null, host: "127.0.0.1", allowEmails: [],
    publicMode: false, configPath: null, tunnelName: null, hostname: null, help: false,
  };
  let hostProvided = false;
  let portProvided = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    const requireValue = (flag) => {
      if (!next || next.startsWith("-")) throw new Error(`${flag} requires a value.`);
      i += 1;
      // Values are echoed back to the terminal, so control characters (ANSI escapes,
      // carriage returns) must never reach the output.
      if (CONTROL_CHARACTERS.test(next)) throw new Error(`${flag} value contains control characters.`);
      return next;
    };

    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--mode") result.mode = requireValue(arg);
    else if (arg === "--port" || arg === "-p") {
      const rawPort = requireValue(arg);
      if (!/^\d+$/.test(rawPort)) throw new Error("--port must be a decimal integer.");
      result.port = Number(rawPort);
      portProvided = true;
    }
    else if (arg === "--host") { result.host = requireValue(arg); hostProvided = true; }
    else if (arg === "--allow-email") result.allowEmails.push(...requireValue(arg).split(",").map((v) => v.trim()).filter(Boolean));
    else if (arg === "--public") result.publicMode = true;
    else if (arg === "--config") result.configPath = requireValue(arg);
    else if (arg === "--tunnel") result.tunnelName = requireValue(arg);
    else if (arg === "--hostname") result.hostname = requireValue(arg);
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (result.help) return result;
  if (!["quick", "named"].includes(result.mode)) throw new Error("--mode must be quick or named.");

  if (result.mode === "quick") {
    if (!Number.isInteger(result.port) || result.port < 1 || result.port > 65535) {
      throw new Error("Choose a valid TCP port between 1 and 65535 with --port.");
    }
    if (!["127.0.0.1", "localhost", "::1"].includes(result.host)) {
      throw new Error("For safety, Localshare only targets loopback hosts (127.0.0.1, localhost or ::1).");
    }
    if (result.configPath || result.tunnelName || result.hostname) {
      throw new Error("--config, --tunnel and --hostname are only valid with --mode named.");
    }
    if (result.publicMode && result.allowEmails.length > 0) throw new Error("Choose either --public or --allow-email, not both.");
    if (!result.publicMode && result.allowEmails.length === 0) {
      throw new Error("Email restriction is the default. Provide --allow-email person@example.com, or explicitly choose --public.");
    }
    for (const email of result.allowEmails) {
      if (!EMAIL_RE.test(email) && !EMAIL_DOMAIN_RE.test(email)) throw new Error(`Invalid email address or wildcard domain: ${email}`);
    }
    result.allowEmails = [...new Set(result.allowEmails.map((email) => email.toLowerCase()))];
  } else {
    if (!result.configPath || !result.tunnelName) throw new Error("Named mode requires both --config <path> and --tunnel <name>.");
    if (result.publicMode || result.allowEmails.length > 0) {
      throw new Error("Named tunnel access is configured through Cloudflare Access policies, not --public/--allow-email.");
    }
    if (hostProvided || portProvided) {
      throw new Error("--host and --port are only valid with --mode quick.");
    }
    if (result.hostname && !HOST_RE.test(result.hostname)) throw new Error("--hostname must be a valid DNS hostname such as preview.example.com.");
  }
  return result;
}

export function helpText() {
  return `Localshare v0.4.3\n\nQuick temporary link:\n  localshare --port 3000 --allow-email teammate@example.com\n  localshare --port 3000 --public\n\nStable named tunnel:\n  localshare --mode named --config ~/.cloudflared/config.yml --tunnel localshare-preview --hostname preview.example.com\n\nOptions:\n  -p, --port <port>       Local service port (quick mode)\n      --host <host>       Loopback origin only; default 127.0.0.1\n      --allow-email <...> Quick Tunnel email PIN allow-list; supports *@domain.com\n      --public             Public Quick Tunnel; requires typing EXPOSE\n      --mode <quick|named> Tunnel mode; default quick\n      --config <path>      Named tunnel cloudflared config file\n      --tunnel <name>      Named tunnel name (named mode)\n      --hostname <host>    Display hostname configured in ingress (named mode)\n  -h, --help              Show this help\n\nStop with Ctrl+C. Named tunnel DNS and Access policies must be configured in Cloudflare first.\n`;
}

export function originUrl(host, port) {
  const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${normalizedHost}:${port}`;
}
