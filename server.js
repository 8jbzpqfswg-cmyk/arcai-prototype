const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const TRANSCODE_DIR = path.join(ROOT, "transcoded");
const LOCAL_FFMPEG_PATH = path.join(ROOT, "bin", "ffmpeg.exe");
const FFMPEG_PATH = process.env.FFMPEG_PATH || (fs.existsSync(LOCAL_FFMPEG_PATH) ? LOCAL_FFMPEG_PATH : "ffmpeg");
const PYTHON_PATH = process.env.PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
const YOLO_SCRIPT = path.join(ROOT, "scripts", "arcai_yolo_ball_track.py");
const YOLO_MODEL = process.env.ARCAI_YOLO_MODEL || "yolov8x.pt";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".mp4": "video/mp4"
};

const baseAnalysis = {
  analysis_id: "server-demo-arcai-001",
  mode: "client_pose_api",
  status: "pending_verified_detection",
  shot_score: null,
  recommendation: "No recommendation is issued until verified pose and ball detection are available.",
  metrics: {
    release_angle_deg: null,
    entry_arc_deg: null,
    arc_height_m: null,
    release_height_m: null,
    shot_depth_cm: null,
    left_right_cm: null,
    elbow_extension_peak_dps: null,
    wrist_flexion_peak_dps: null,
    knee_extension_peak_dps: null,
    hip_extension_peak_dps: null,
    kinetic_chain_index: null,
    grf_release_coupling_ms: null,
    dip_to_set_smoothness: null,
    shot_plane_variance_deg: null,
    terminal_curvature_stability: null
  }
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("body too large"));
      }
    });
    request.on("end", () => resolve(body ? JSON.parse(body) : {}));
    request.on("error", reject);
  });
}

function readBuffer(request, limit = 320_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        request.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMultipartFile(contentType, body) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) throw new Error("multipart boundary missing");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const firstBoundary = body.indexOf(boundary);
  if (firstBoundary < 0) throw new Error("multipart file missing");
  const headerStart = firstBoundary + boundary.length + 2;
  const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
  if (headerEnd < 0) throw new Error("multipart header invalid");
  const headerText = body.slice(headerStart, headerEnd).toString("utf8");
  const filenameMatch = /filename="([^"]+)"/i.exec(headerText);
  const dataStart = headerEnd + 4;
  const endBoundary = Buffer.from(`\r\n--${match[1] || match[2]}`);
  const dataEnd = body.indexOf(endBoundary, dataStart);
  if (dataEnd < 0) throw new Error("multipart file end missing");
  return {
    filename: filenameMatch ? path.basename(filenameMatch[1]) : "upload.mov",
    buffer: body.slice(dataStart, dataEnd)
  };
}

function runFfmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (FFMPEG_PATH !== "ffmpeg" && !fs.existsSync(FFMPEG_PATH)) {
      reject(new Error("ffmpeg.exe is not installed in ArcAI bin"));
      return;
    }
    const args = [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-vf",
      "scale=960:-2,fps=30",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      outputPath
    ];
    const child = spawn(FFMPEG_PATH, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12_000) stderr = stderr.slice(-12_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) resolve();
      else reject(new Error(stderr || `ffmpeg exited with ${code}`));
    });
  });
}

function runYoloBallTrack(videoPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(YOLO_SCRIPT)) {
      resolve({ ok: false, error: "YOLO script is missing" });
      return;
    }
    const args = [YOLO_SCRIPT, videoPath, "--model", YOLO_MODEL];
    const child = spawn(PYTHON_PATH, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, error: "YOLO ball detection timed out" });
    }, 180_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 4_000_000) stdout = stdout.slice(-4_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 16_000) stderr = stderr.slice(-16_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
    child.on("close", () => {
      clearTimeout(timer);
      const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
      for (const line of lines) {
        if (!line.startsWith("{") || !line.endsWith("}")) continue;
        try {
          const parsed = JSON.parse(line);
          if (!parsed.ok && stderr) parsed.stderr = stderr;
          resolve(parsed);
          return;
        } catch {
          // Keep looking for a valid JSON line.
        }
      }
      resolve({
        ok: false,
        error: "YOLO did not return JSON",
        stderr
      });
    });
  });
}

function bounded(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createAnalysis(source) {
  const seedText = JSON.stringify(source || {});
  const digest = crypto.createHash("sha256").update(seedText).digest();
  return {
    ...baseAnalysis,
    analysis_id: `srv-${Date.now().toString(36)}-${digest.toString("hex").slice(0, 8)}`,
    source,
    metrics: { ...baseAnalysis.metrics },
    caveat: "This endpoint does not infer pose, ball, rim, board, court, or ground reaction force from pixels. Pose inference runs in the browser through MediaPipe when available."
  };
}

function safeFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(ROOT, `.${requested}`);
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

async function handleApi(request, response, pathname) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    });
    response.end();
    return;
  }

  if (request.method === "GET" && pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      service: "ArcAI prototype API",
      version: "0.1.0",
      analysis_mode: "client_pose_api_pending"
    });
  }

  if (request.method === "GET" && pathname === "/api/evidence") {
    const evidencePath = path.join(ROOT, "data", "evidence.json");
    return sendJson(response, 200, JSON.parse(fs.readFileSync(evidencePath, "utf8")));
  }

  if (request.method === "POST" && pathname === "/api/analyze") {
    try {
      const payload = await readBody(request);
      return sendJson(response, 200, createAnalysis(payload));
    } catch (error) {
      return sendJson(response, 400, { error: "invalid_request", message: error.message });
    }
  }

  if (request.method === "POST" && pathname === "/api/transcode") {
    try {
      fs.mkdirSync(TRANSCODE_DIR, { recursive: true });
      const body = await readBuffer(request);
      const file = parseMultipartFile(request.headers["content-type"], body);
      const id = crypto.randomBytes(8).toString("hex");
      const inputPath = path.join(TRANSCODE_DIR, `${id}-${file.filename}`);
      const outputPath = path.join(TRANSCODE_DIR, `${id}.mp4`);
      fs.writeFileSync(inputPath, file.buffer);
      await runFfmpeg(inputPath, outputPath);
      const ballTrack = await runYoloBallTrack(outputPath);
      return sendJson(response, 200, {
        ok: true,
        source: file.filename,
        url: `/transcoded/${id}.mp4`,
        bytes: fs.statSync(outputPath).size,
        codec: "h264/aac",
        ball_track: ballTrack
      });
    } catch (error) {
      return sendJson(response, 500, {
        ok: false,
        error: "transcode_failed",
        message: error.message
      });
    }
  }

  if (request.method === "POST" && pathname === "/api/checkout") {
    let payload = {};
    try {
      payload = await readBody(request);
    } catch {
      payload = {};
    }
    return sendJson(response, 501, {
      error: "checkout_not_configured",
      plan: payload.plan || null,
      cadence: payload.cadence || null,
      message: "Stripe Checkout is not enabled because no server-side Stripe secret key and price IDs are configured."
    });
  }

  return sendJson(response, 404, { error: "not_found" });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url.pathname);
    return;
  }

  const filePath = safeFilePath(url.pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath);
  const stat = fs.statSync(filePath);
  const noStoreExtensions = new Set([".html", ".js", ".css", ".webmanifest"]);
  const headers = {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": noStoreExtensions.has(extension) ? "no-store" : "public, max-age=3600"
  };

  if (extension === ".mp4") {
    headers["Accept-Ranges"] = "bytes";
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        response.writeHead(416, {
          ...headers,
          "Content-Range": `bytes */${stat.size}`
        });
        response.end();
        return;
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start >= stat.size || end >= stat.size || start > end) {
        response.writeHead(416, {
          ...headers,
          "Content-Range": `bytes */${stat.size}`
        });
        response.end();
        return;
      }

      response.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      fs.createReadStream(filePath, { start, end }).pipe(response);
      return;
    }
  }

  response.writeHead(200, {
    ...headers,
    "Content-Length": stat.size
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  fs.createReadStream(filePath).pipe(response);
});

server.listen(PORT, () => {
  console.log(`ArcAI prototype running at http://localhost:${PORT}`);
});
