import React, { useRef, useState, useEffect } from "react";

const PRESETS = [
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
  const [format, setFormat] = useState("image/jpeg"); // JPG or PNG
  const [generatedURL, setGeneratedURL] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // cleanup
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
      setError("Please upload an image file (JPG/PNG/etc).");
      return;
    }
    setError("");
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewURL(url);

    try {
      let bmp;
      if ("createImageBitmap" in window) {
        try {
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
    return preset.id === "custom"
      ? { w: Number(customW) || 600, h: Number(customH) || 600 }
      : { w: preset.w, h: preset.h };
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

      canvas.width = targetW;
      canvas.height = targetH;

      // Always use white background (no UI control anymore)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);

      // cover-fit crop
      const srcW = bitmap.width;
      const srcH = bitmap.height;
      const srcAspect = srcW / srcH;
      const dstAspect = targetW / targetH;

      let sx = 0, sy = 0, sw = srcW, sh = srcH;
      if (srcAspect > dstAspect) {
        const newSw = srcH * dstAspect;
        sx = Math.max(0, (srcW - newSw) / 2);
        sw = newSw;
      } else {
        const newSh = srcW / dstAspect;
        sy = Math.max(0, (srcH - newSh) / 2);
        sh = newSh;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, targetW, targetH);

      const mime = format;
      const quality = 0.92; // fixed quality (UI removed)
      const blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
      if (!blob) throw new Error("Failed to export image");

      if (generatedURL) URL.revokeObjectURL(generatedURL);
      const outURL = URL.createObjectURL(blob);
      setGeneratedURL(outURL);

      // auto-download
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

  // ------- simple styles (no Tailwind needed) -------
  const page = { minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f6f8fb", color: "#0f172a" };
  const header = {
    background: "linear-gradient(90deg, #6366f1, #22d3ee)",
    color: "white",
    padding: "28px 16px",
    textAlign: "center",
    fontWeight: 800,
    fontSize: "32px",
    letterSpacing: "0.2px",
  };
  const container = { maxWidth: 900, width: "100%", margin: "24px auto", padding: "0 16px" };
  const card = {
    background: "white",
    borderRadius: 20,
    boxShadow: "0 8px 30px rgba(2,8,23,0.08)",
    padding: 24,
    textAlign: "center",
  };
  const drop = {
    border: "2px dashed #cbd5e1",
    borderRadius: 16,
    padding: 24,
    cursor: "pointer",
    background: "#fff",
  };
  const btn = {
    width: "100%",
    border: "0",
    borderRadius: 16,
    padding: "14px 18px",
    fontWeight: 700,
    color: "white",
    background: "linear-gradient(90deg, #0ea5e9, #22c55e)",
    boxShadow: "0 8px 20px rgba(14,165,233,0.25)",
    cursor: "pointer",
  };
  const input = { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1" };
  const label = { display: "block", margin: "14px 0 6px", fontWeight: 600, fontSize: 14 };

  return (
    <div style={page}>
      <header style={header}>Passport Photo Resizer</header>

      <main style={container}>
        <div style={card}>
          {/* Dropzone */}
          <div
            style={drop}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onPaste={onPaste}
            onClick={pickFile}
            title="Click or drag a picture here"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
            {!previewURL ? (
              <>
                <div style={{ fontSize: 48 }}>📷</div>
                <p style={{ marginTop: 8, fontSize: 18, fontWeight: 600 }}>Click or drag a picture here</p>
                <p style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>You can also paste an image from the clipboard</p>
              </>
            ) : (
              <div>
                <img
                  src={previewURL}
                  alt="preview"
                  style={{ maxHeight: "50vh", maxWidth: "100%", borderRadius: 12, objectFit: "contain" }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                  Original: {imgNatural.w}×{imgNatural.h}px
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>
              {error}
            </div>
          )}

          {/* Controls (centered) */}
          <div style={{ maxWidth: 520, margin: "20px auto 0" }}>
            <label style={label}>Preset</label>
            <select style={input} value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} {p.info ? `(${p.info})` : ""}
                </option>
              ))}
            </select>

            {presetId === "custom" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label}>Width (px)</label>
                  <input type="number" min={100} style={input} value={customW} onChange={(e) => setCustomW(e.target.value)} />
                </div>
                <div>
                  <label style={label}>Height (px)</label>
                  <input type="number" min={100} style={input} value={customH} onChange={(e) => setCustomH(e.target.value)} />
                </div>
              </div>
            )}

            <label style={label}>Format</label>
            <select style={input} value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="image/jpeg">JPG</option>
              <option value="image/png">PNG</option>
            </select>

            <div style={{ marginTop: 16 }}>
              <button onClick={doResize} disabled={busy || !bitmap} style={{ ...btn, opacity: busy || !bitmap ? 0.6 : 1 }}>
                {busy ? "Resizing…" : previewURL ? "Resize & Download" : "Upload a picture first"}
              </button>
            </div>

            {generatedURL && (
              <a href={generatedURL} download style={{ display: "block", marginTop: 8, fontSize: 13, color: "#2563eb" }}>
                If download didn’t start, click here.
              </a>
            )}

            <p style={{ marginTop: 14, fontSize: 12, color: "#64748b" }}>
              Tip: Ensure your photo follows your country’s official rules (background, head size, expression).
            </p>
          </div>

          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      </main>

      <footer style={{ textAlign: "center", fontSize: 12, color: "#64748b", padding: "20px 0" }}>
        © {new Date().getFullYear()} Passport Resizer • Made by JH.
      </footer>
    </div>
  );
}

async function loadImageBitmapFallback(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
