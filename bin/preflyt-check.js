#!/usr/bin/env node
"use strict";

// ── Zero-dependency CLI for Preflyt security scanning ────────────────────────
// Uses only Node.js built-in modules. No node_modules required.

var https = require("https");
var http = require("http");
var URL = require("url").URL;

var API_URL = "https://api.preflyt.dev/api/scan/cli";
var REPORT_URL = "https://api.preflyt.dev/api/report";
var VERSION = "1.0.0";

var SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

// ── Humorous messages ───────────────────────────────────────────────────────

var MESSAGES_CLEAN = [
  "Your deployment is cleaner than my git history. Ship it.",
  "Zero issues. Either you're cracked or your app does nothing. Either way, congrats.",
  "We checked everything. You're suspiciously secure.",
  "Nothing found. You may now mass-reply 'skill issue' to everyone who gets hacked.",
];

var MESSAGES_FEW = [
  "99% there. Just a couple things standing between you and a clean conscience.",
  "Almost perfect. Almost.",
];

var MESSAGES_SOME = [
  "Not bad, not great. Your app is the C+ student of security.",
  "A few open doors. Nothing catastrophic, but your .env file is sweating.",
  "Found some things. The kind that make you say 'I'll fix it later' and then never do. Fix them now.",
];

var MESSAGES_MANY = [
  "Your deployment is giving 'I'll add security later.' It's later.",
  "We found more issues than you have users. Let's fix that ratio.",
  "This is why we exist. Deep breaths. Start with the red ones.",
];

var MESSAGES_HIGH = [
  "Someone left the keys in the ignition. On a highway. At night.",
  "Your database said hi. From the public internet. Fix this immediately.",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMessage(data) {
  var findings = data.findings || [];
  var hasHigh = findings.some(function (f) {
    return f.severity === "high" || f.severity === "critical";
  });

  if (hasHigh) return pickRandom(MESSAGES_HIGH);

  var count = data.total_issues || 0;
  if (count === 0) return pickRandom(MESSAGES_CLEAN);
  if (count <= 2) return pickRandom(MESSAGES_FEW);
  if (count <= 5) return pickRandom(MESSAGES_SOME);
  return pickRandom(MESSAGES_MANY);
}

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  var args = {
    url: null,
    key: null,
    fail: false,
    failOn: "high",
    quiet: false,
    json: false,
    share: false,
    timeout: 60,
    help: false,
  };

  var i = 2; // skip node + script
  while (i < argv.length) {
    var arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--fail") {
      args.fail = true;
    } else if (arg === "--quiet" || arg === "-q") {
      args.quiet = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--share") {
      args.share = true;
    } else if (arg === "--key" || arg === "-k") {
      i++;
      args.key = argv[i] || null;
    } else if (arg === "--fail-on") {
      i++;
      args.failOn = argv[i] || "high";
    } else if (arg === "--timeout") {
      i++;
      args.timeout = parseInt(argv[i], 10) || 60;
    } else if (!arg.startsWith("-") && !args.url) {
      args.url = arg;
    }
    i++;
  }

  return args;
}

// ── Output helpers ───────────────────────────────────────────────────────────

var CATEGORY_LABELS = {
  file_exposure: "File & Code Exposure",
  server_network: "Server & Network Security",
  http_hardening: "HTTP Hardening",
};

var SEVERITY_LABELS = {
  critical: "CRIT",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

function padRight(str, len) {
  while (str.length < len) str += " ";
  return str;
}

function printHelp() {
  console.log("");
  console.log("  preflyt-check <url> [options]");
  console.log("");
  console.log("  Pre-deployment security scanner. Checks your live site for");
  console.log("  exposed secrets, open ports, and misconfigurations.");
  console.log("");
  console.log("  Options:");
  console.log("    --key, -k <key>     Pro API key for unlimited scans");
  console.log("    --fail              Exit code 1 if issues found");
  console.log("    --fail-on <level>   Minimum severity to fail on (high, medium, low)");
  console.log("    --quiet, -q         Minimal output, just pass/fail");
  console.log("    --json              Output raw JSON");
  console.log("    --share             Create a shareable report link");
  console.log("    --timeout <sec>     Scan timeout in seconds (default: 60)");
  console.log("    --help, -h          Show this help");
  console.log("");
  console.log("  Examples:");
  console.log("    npx preflyt-check https://mysite.com");
  console.log("    npx preflyt-check https://mysite.com --key sk_live_xxx");
  console.log("    npx preflyt-check https://mysite.com --fail --fail-on medium");
  console.log("");
  console.log("  https://preflyt.dev");
  console.log("");
}

function printResults(data, args, message, reportUrl) {
  // JSON mode — raw output
  if (args.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  var timeStr = data.scan_time_seconds ? "(" + data.scan_time_seconds + "s)" : "";

  // Limit reached
  if (data.status === "limit_reached") {
    console.log("");
    console.log("  \u24D8 Free scan limit reached (3/3 used).");
    console.log("");
    console.log("  Get unlimited CLI scans with Pro - $9.99/mo");
    console.log("  https://preflyt.dev/pricing");
    console.log("");
    console.log("  Tip: Add --key YOUR_KEY for unlimited scans.");
    console.log("");
    console.log("  Deploy continues. No issues blocked.");
    console.log("");
    return;
  }

  // Error
  if (data.status === "error") {
    console.log("");
    console.log("  \u26A0\uFE0F  Scan could not complete: " + (data.message || "unknown error"));
    console.log("");
    console.log("  Deploy continues. No issues blocked.");
    console.log("");
    return;
  }

  // Quiet mode
  if (args.quiet) {
    if (data.status === "clean") {
      console.log("  \u2705 All clear. " + timeStr);
    } else {
      console.log("  \u26A0\uFE0F  " + data.total_issues + " issue" + (data.total_issues !== 1 ? "s" : "") + " found. " + timeStr);
    }
    return;
  }

  // Full output — category summary
  console.log("");
  var cats = data.categories || {};
  var order = ["file_exposure", "server_network", "http_hardening"];

  for (var c = 0; c < order.length; c++) {
    var key = order[c];
    var cat = cats[key];
    var label = CATEGORY_LABELS[key] || key;
    if (!cat || cat.status === "clean") {
      console.log("  \u2713 " + padRight(label, 28) + " - clean");
    } else {
      console.log("  \u2717 " + padRight(label, 28) + " - " + cat.count + " issue" + (cat.count !== 1 ? "s" : ""));
    }
  }

  // Clean
  if (data.status === "clean") {
    console.log("");
    if (message) console.log("  " + message);
    console.log("");
    var detailsUrl = reportUrl || "https://preflyt.dev";
    console.log("  Details: " + detailsUrl + "  " + timeStr);
    console.log("");
    return;
  }

  // Issues
  console.log("");
  console.log("  \u26A0\uFE0F  " + data.total_issues + " issue" + (data.total_issues !== 1 ? "s" : "") + " found:");
  console.log("");

  var findings = data.findings || [];
  // Sort by severity descending
  findings.sort(function (a, b) {
    return (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
  });

  for (var f = 0; f < findings.length; f++) {
    var finding = findings[f];
    var sevLabel = SEVERITY_LABELS[finding.severity] || finding.severity.toUpperCase();
    console.log("  " + padRight(sevLabel, 8) + finding.title);
  }

  console.log("");
  if (message) console.log("  " + message);
  console.log("");
  var detailsUrl = reportUrl || "https://preflyt.dev";
  console.log("  Details: " + detailsUrl + "  " + timeStr);
  console.log("");
}

// ── HTTP request ─────────────────────────────────────────────────────────────

function doScan(url, apiKey, timeoutSec) {
  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify({
      url: url,
      api_key: apiKey || null,
    });

    var parsed = new URL(API_URL);
    var reqModule = parsed.protocol === "https:" ? https : http;

    var reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "User-Agent": "preflyt-check/" + VERSION,
      },
    };

    var timeoutMs = timeoutSec * 1000;

    var timer = setTimeout(function () {
      req.destroy();
      reject(new Error("timeout"));
    }, timeoutMs);

    var req = reqModule.request(reqOpts, function (res) {
      var chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        clearTimeout(timer);
        var body = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          try {
            var errData = JSON.parse(body);
            reject(new Error(errData.detail || errData.message || "HTTP " + res.statusCode));
          } catch (_e) {
            reject(new Error("HTTP " + res.statusCode));
          }
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (_e) {
          reject(new Error("Invalid JSON response"));
        }
      });
    });

    req.on("error", function (err) {
      clearTimeout(timer);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

// ── Report creation ─────────────────────────────────────────────────────────

function createReport(scanData, message) {
  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify({
      target_url: scanData.url,
      findings: (scanData.findings || []).map(function (f) {
        return { id: f.title, type: "cli", severity: f.severity, title: f.title, summary: "", affected: { url: scanData.url, path: "" }, evidence: { signals: [], examples: [] }, why_it_matters: "", how_to_fix: { general: "", examples: {} }, confidence: "high", source: { templates: [], engine: "cli" } };
      }),
      categories: scanData.categories || null,
      total_issues: scanData.total_issues || 0,
      scan_time_seconds: scanData.scan_time_seconds || 0,
      message: message || null,
    });

    var parsed = new URL(REPORT_URL);
    var reqModule = parsed.protocol === "https:" ? https : http;

    var reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "User-Agent": "preflyt-check/" + VERSION,
      },
    };

    var req = reqModule.request(reqOpts, function (res) {
      var chunks = [];
      res.on("data", function (chunk) { chunks.push(chunk); });
      res.on("end", function () {
        var body = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          reject(new Error("Failed to create report"));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (_e) {
          reject(new Error("Invalid report response"));
        }
      });
    });

    req.on("error", function (err) { reject(err); });

    var timer = setTimeout(function () { req.destroy(); reject(new Error("timeout")); }, 10000);
    req.on("close", function () { clearTimeout(timer); });

    req.write(payload);
    req.end();
  });
}

// ── Exit code logic ──────────────────────────────────────────────────────────

function shouldFail(data, args) {
  // Exit 1 ONLY when ALL conditions are true:
  // 1. --fail flag explicitly set
  // 2. Scan completed successfully (status is clean or issues_found)
  // 3. At least one finding meets or exceeds --fail-on severity
  if (!args.fail) return false;
  if (data.status !== "issues_found") return false;

  var threshold = SEVERITY_RANK[args.failOn] || SEVERITY_RANK.high;
  var findings = data.findings || [];

  for (var i = 0; i < findings.length; i++) {
    var rank = SEVERITY_RANK[findings[i].severity] || 0;
    if (rank >= threshold) return true;
  }

  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  var args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.url) {
    printHelp();
    process.exit(0);
  }

  // Basic URL validation
  try {
    var parsed = new URL(args.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      console.log("");
      console.log("  URL must start with http:// or https://");
      console.log("");
      process.exit(0);
    }
  } catch (_e) {
    console.log("");
    console.log("  Invalid URL: " + args.url);
    console.log("  URL must start with http:// or https://");
    console.log("");
    process.exit(0);
  }

  if (!args.json) {
    console.log("");
    console.log("\uD83D\uDD0D Preflyt scanning " + args.url + "...");
  }

  try {
    var data = await doScan(args.url, args.key, args.timeout);

    // Pick a message and create a report for successful scans
    var message = null;
    var reportUrl = null;

    if (data.status === "clean" || data.status === "issues_found") {
      message = pickMessage(data);

      try {
        var report = await createReport(data, message);
        if (report && report.url) {
          reportUrl = report.url;
        }
      } catch (_e) {
        // Silent fallback - printResults will use https://preflyt.dev
      }
    }

    printResults(data, args, message, reportUrl);

    if (shouldFail(data, args)) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    if (!args.json) {
      console.log("");
      console.log("  \u26A0\uFE0F  Scan could not complete: " + err.message);
      console.log("");
      console.log("  Deploy continues. No issues blocked.");
      console.log("");
    } else {
      console.log(JSON.stringify({
        status: "error",
        url: args.url,
        message: err.message,
      }));
    }
    // Always exit 0 on errors — never block a deploy due to our own failures
    process.exit(0);
  }
}

// Wrap everything — any uncaught exception exits 0
try {
  main();
} catch (err) {
  console.error("  Preflyt encountered an unexpected error: " + err.message);
  console.error("  Deploy continues. No issues blocked.");
  process.exit(0);
}
