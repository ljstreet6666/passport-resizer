import React, { useRef, useState, useEffect } from "react";

/**
 * Passport Photo Resizer — single-file React component
 * - Drag & drop or click to upload
 * - Choose preset (common passport/visa sizes) or custom pixel size
 * - Click "Resize" to generate and download the output
 * - Client-side only; no server required
 *
 * Notes
 * - Uses canvas with imageSmoothingQuality='high' for better scaling
 * - Attempts to respect EXIF orientation via createImageBitmap when available
 * - Exports JPG by default (configurable)
 */

const PRESETS = [
  // label, width px, height px, description
  { id: "sg-35x45", label: "Singapore Passport — 35×45 mm", w: 413, h: 531, info: "~300 DPI" },
  { id: "my-35x50", label: "Malaysia Passport — 35×50 mm", w: 413, h: 591, info: "~300 DPI" },
  { id: "ph-35x45", label: "Philippines Passport — 35×45 mm", w: 413, h: 531, info: "~300 DPI" },
  { id: "us-2x2", label: "US Passport — 2×2 in", w: 600, h: 600, info: "300 DPI" },
  { id: "schengen-35x45", label: "Schengen Visa — 35×45 mm", w: 413, h: 531, info: "~300 DPI" },
  { id: "custom", label: "Custom (pixels)", w: 600, h: 600, info: "Set below" },
];

export default function App() {
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewURL, setPreviewURL] = useState("");
  const [bitmap, setBitmap] = useState(null);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });

  const [presetId, setPresetId] = useState("sg-35x45");
  const [customW, setCustomW] = useState(600);
  const [customH, setCustomH] = useState(600);
  const [format, setFormat] = useState("image/jpeg");
  const [quality, setQuality] = useState(0.92);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [generatedURL, setGeneratedURL] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Cleanup object URLs when file changes
  useEffect(() => {
    return () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
      if (generatedURL) URL.revokeObjectURL(generatedURL);
    };
  }, [previewURL, generatedURL]);

  const pickFile = () => fileInputRef.current?.click();

  const handleFiles = async (files) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, HEIC).");
      return;
    }
    setError("");
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewURL(url);

    try {
      // Try createImageBitmap with EXIF orientation handling
      let bmp;
      if ("createImageBitmap" in window) {
        try {
          // Some browsers support imageOrientation option
          // @ts-ignore
          bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
        } catch {
          bmp = await createImageBitmap(f);
        }
      } else {
        bmp = await loadImageBitmapFallback(url);
      }
      setBitmap(bmp);
      setImgNatural({ w: bmp.width, h: bmp.height });
    } catch (e) {
      console.error(e);
      setError("Failed to load image. Try another file.");
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    if (dt?.files?.length) handleFiles(dt.files);
  };

  const onPaste = async (e) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
    if (item) {
      const f = item.getAsFile();
      if (f) handleFiles([f]);
    }
  };

  const getTargetSize = () => {
    const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
    return preset.id === "custom" ? { w: Number(customW) || 600, h: Number(customH) || 600 } : { w: preset.w, h: preset.h };
  };

  const doResize = async () => {
    if (!bitmap) {
      setError("Please upload an image first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { w: targetW, h: targetH } = getTargetSize();
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // Set canvas size
      canvas.width = targetW;
      canvas.height = targetH;

      // Fill background
      ctx.save();
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.restore();

      // Compute cover fit (center-crop) to maintain aspect ratio as many authorities require head-size ratios.
      const srcW = bitmap.width;
      const srcH = bitmap.height;
      const srcAspect = srcW / srcH;
      const dstAspect = targetW / targetH;

      let sx = 0, sy = 0, sw = srcW, sh = srcH;
      if (srcAspect > dstAspect) {
        // Source is wider: crop sides
        const newSw = srcH * dstAspect;
        sx = Math.max(0, (srcW - newSw) / 2);
        sw = newSw;
      } else {
        // Source is taller: crop top/bottom
        const newSh = srcW / dstAspect;
        sy = Math.max(0, (srcH - newSh) / 2);
        sh = newSh;
      }

      // High-quality draw
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, targetW, targetH);

      const mime = format;
      const blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
      if (!blob) throw new Error("Failed to export image");

      if (generatedURL) URL.revokeObjectURL(generatedURL);
      const outURL = URL.createObjectURL(blob);
      setGeneratedURL(outURL);

      // Auto trigger download
      const a = document.createElement("a");
      const ext = mime === "image/png" ? "png" : "jpg";
      const base = file?.name?.replace(/\.(jpg|jpeg|png|heic|webp|bmp)$/i, "") || "passport";
      a.href = outURL;
      a.download = `${base}_${targetW}x${targetH}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
      setError("Something went wrong while resizing.");
    } finally {
      setBusy(false);
    }
  };

  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">Passport Photo Resizer</h1>
          <div className="text-sm text-slate-500">100% on your browser • No upload</div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto p-4 grid md:grid-cols-[2fr,1fr] gap-6">
          {/* Dropzone + Preview */}
          <section>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onPaste={onPaste}
              className="group relative border-2 border-dashed border-slate-300 rounded-2xl bg-white p-8 flex flex-col items-center justify-center text-center hover:border-slate-400 transition cursor-pointer"
              onClick={pickFile}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {!previewURL ? (
                <>
                  <div className="text-5xl">📷</div>
                  <p className="mt-4 text-lg font-medium">Click or drag a picture here</p>
                  <p className="text-sm text-slate-500 mt-1">You can also paste an image from the clipboard</p>
                </>
              ) : (
                <div className="w-full">
                  <img
                    src={previewURL}
                    alt="preview"
                    className="max-h-[50vh] mx-auto rounded-xl shadow-sm object-contain"
                    style={{ imageOrientation: "from-image" }}
                  />
                  <div className="mt-3 text-xs text-slate-500">Original: {imgNatural.w}×{imgNatural.h}px</div>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">{error}</div>
            )}
          </section>

          {/* Controls */}
          <aside>
            <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5 space-y-4 sticky top-4">
              <h2 className="text-lg font-semibold">Resize settings</h2>

              {/* Preset */}
              <label className="block text-sm font-medium">Preset</label>
              <select
                className="w-full border rounded-xl px-3 py-2 bg-white"
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {p.info ? `(${p.info})` : ""}
                  </option>
                ))}
              </select>

              {presetId === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium">Width (px)</label>
                    <input
                      type="number"
                      min={100}
                      className="w-full border rounded-xl px-3 py-2"
                      value={customW}
                      onChange={(e) => setCustomW(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Height (px)</label>
                    <input
                      type="number"
                      min={100}
                      className="w-full border rounded-xl px-3 py-2"
                      value={customH}
                      onChange={(e) => setCustomH(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Background */}
              <div className="grid grid-cols-[1fr,auto] gap-3 items-end">
                <div>
                  <label className="block text-sm font-medium">Background</label>
                  <input
                    type="text"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2"
                    placeholder="#ffffff"
                  />
                </div>
                <div className="flex items-center justify-center">
                  <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-12 h-10 rounded" />
                </div>
              </div>

              {/* Output */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium">Format</label>
                  <select className="w-full border rounded-xl px-3 py-2" value={format} onChange={(e) => setFormat(e.target.value)}>
                    <option value="image/jpeg">JPG</option>
                    <option value="image/png">PNG</option>
                  </select>
                </div>
                {format === "image/jpeg" && (
                  <div>
                    <label className="block text-sm font-medium">Quality</label>
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.01}
                      value={quality}
                      onChange={(e) => setQuality(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-xs text-slate-500">{Math.round(quality * 100)}%</div>
                  </div>
                )}
              </div>

              <button
                onClick={doResize}
                disabled={busy || !bitmap}
                className="w-full rounded-2xl py-3 font-semibold shadow-sm bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                title={!bitmap ? "Upload a photo first" : "Resize and download"}
              >
                {busy ? "Resizing…" : previewURL ? "Resize this picture" : "Upload a picture first"}
              </button>

              {generatedURL && (
                <a
                  href={generatedURL}
                  download
                  className="block text-center text-sm text-blue-600 hover:underline"
                >
                  If download didn’t start, click here.
                </a>
              )}

              <p className="text-xs text-slate-500 pt-2">
                Tip: Most authorities require neutral expression, plain light background, and specific head-size ratios. This tool only resizes and centers; please ensure your photo follows your country’s rules.
              </p>

              <canvas ref={canvasRef} className="hidden" />
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-6">
        © {new Date().getFullYear()} Passport Resizer • Made for fast at‑home ID photos.
      </footer>
    </div>
  );
}

async function loadImageBitmapFallback(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Convert HTMLImageElement to ImageBitmap-like object for drawImage
      // We'll just return the element; drawImage accepts it directly
      // but our code expects .width/.height which it has.
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}
