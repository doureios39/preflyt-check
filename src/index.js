"use strict";

const https = require("https");
const http = require("http");
const { URL } = require("url");

const API_URL = "https://api.preflyt.dev/api/scan/cli";

/**
 * Run a Preflyt scan programmatically.
 *
 * @param {string} url - The URL to scan.
 * @param {object} [opts] - Options.
 * @param {string} [opts.apiKey] - Pro API key for unlimited scans.
 * @param {number} [opts.timeout] - Timeout in seconds (default 60).
 * @returns {Promise<object>} The scan result.
 */
function scan(url, opts) {
  opts = opts || {};
  var timeout = (opts.timeout || 60) * 1000;

  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify({
      url: url,
      api_key: opts.apiKey || null,
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
        "User-Agent": "preflyt-check/1.0.0",
      },
    };

    var timer = setTimeout(function () {
      req.destroy();
      reject(new Error("timeout"));
    }, timeout);

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

module.exports = { scan: scan };
