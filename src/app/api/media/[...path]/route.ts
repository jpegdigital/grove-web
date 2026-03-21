import { NextRequest } from "next/server";
import { stat, open } from "node:fs/promises";
import { join } from "node:path";

const MEDIA_DIR = process.env.MEDIA_DIRECTORY ?? "E:/Entertainment/PradoTube";

// Only allow safe file extensions
const ALLOWED_EXT = new Set([".mp4", ".webm", ".mkv", ".jpg", ".jpeg", ".png", ".json"]);

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const relativePath = segments.join("/");

  // Block path traversal
  if (relativePath.includes("..") || relativePath.startsWith("/")) {
    return new Response("Forbidden", { status: 403 });
  }

  const ext = "." + relativePath.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXT.has(ext)) {
    return new Response("Unsupported file type", { status: 400 });
  }

  const filePath = join(MEDIA_DIR, relativePath);

  // Ensure resolved path is still within MEDIA_DIR
  const resolvedMediaDir = join(MEDIA_DIR);
  if (!filePath.startsWith(resolvedMediaDir)) {
    return new Response("Forbidden", { status: 403 });
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const fileSize = fileStat.size;

  // Handle range requests for video seeking
  const rangeHeader = request.headers.get("range");

  if (rangeHeader && contentType.startsWith("video/")) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return new Response("Invalid range", { status: 416 });
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const chunkSize = end - start + 1;
    const fileHandle = await open(filePath, "r");
    const stream = fileHandle.createReadStream({ start, end });

    // Convert Node readable to web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: string | Buffer) => controller.enqueue(new Uint8Array(typeof chunk === "string" ? Buffer.from(chunk) : chunk)));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
        fileHandle.close();
      },
    });

    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // Full file response (non-range or non-video)
  const fileHandle = await open(filePath, "r");
  const stream = fileHandle.createReadStream();

  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: string | Buffer) => controller.enqueue(new Uint8Array(typeof chunk === "string" ? Buffer.from(chunk) : chunk)));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
      fileHandle.close();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
