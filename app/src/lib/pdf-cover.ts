/**
 * Render page 1 of a PDF to a JPEG, in the browser.
 *
 * Rasterising a PDF server-side would mean native binaries (poppler/canvas) that
 * don't exist on Vercel's serverless runtime. The browser already has a PDF
 * engine available via pdf.js, and the admin's machine is doing nothing while
 * the upload runs — so the cover is produced client-side and uploaded as a small
 * JPEG alongside the PDF.
 *
 * Everything here is best-effort: if a PDF is encrypted, corrupt, or pdf.js
 * fails for any reason, we return null and the shelf falls back to its
 * typographic cover. A missing thumbnail must never block a magazine upload.
 */

const MAX_WIDTH = 720; // plenty for a 168px shelf cover on a retina screen

export async function renderPdfCover(file: File): Promise<Blob | null> {
  try {
    if (typeof window === "undefined") return null;

    const pdfjs = await import("pdfjs-dist");
    // pdf.js needs its worker; point at the copy shipped in the package so we
    // don't depend on a CDN (and so it keeps working offline / behind a proxy).
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();

    const data = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    const page = await doc.getPage(1);

    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_WIDTH / base.width, 2);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // white base — PDFs with transparency would otherwise render on black
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    await doc.destroy();
    return blob;
  } catch {
    return null; // fall back to the typographic cover
  }
}
