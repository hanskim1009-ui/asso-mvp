"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Renders a single PDF page with optional keyword highlight overlays using pdfjs-dist.
 * Replaces iframe so we can draw highlights on the PDF canvas.
 */
export default function PDFPageWithHighlight({
  pdfUrl,
  pageNumber = 1,
  highlightKeyword = "",
  className = "",
}) {
  const containerRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [highlightRects, setHighlightRects] = useState([]);

  useEffect(() => {
    if (!pdfUrl || !pageNumber || !containerRef.current) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setHighlightRects([]);

    const loadAndRender = async () => {
      try {
        const pdfjs = await import("pdfjs-dist/webpack.mjs");
        const pdf = await pdfjs.getDocument({ url: pdfUrl }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(Number(pageNumber));
        if (cancelled) return;

        const defaultViewport = page.getViewport({ scale: 1 });
        const containerWidth = containerRef.current.offsetWidth || defaultViewport.width;
        const scale = containerWidth / defaultViewport.width;
        const viewport = page.getViewport({ scale });

        setViewportSize({ width: viewport.width, height: viewport.height });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;
        if (cancelled) return;

        const wrap = canvasWrapRef.current;
        if (wrap) {
          wrap.innerHTML = "";
          wrap.style.width = `${viewport.width}px`;
          wrap.style.height = `${viewport.height}px`;
          wrap.appendChild(canvas);
        }

        const keyword = (highlightKeyword || "").trim();
        if (keyword) {
          const textContent = await page.getTextContent();
          if (cancelled) return;
          const rects = getHighlightRects(textContent, keyword, viewport);
          setHighlightRects(rects);
        } else {
          setHighlightRects([]);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "PDF 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAndRender();
    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, highlightKeyword]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
        </div>
      )}
      {error && (
        <div className="p-4 text-red-600 text-sm bg-red-50 rounded">
          {error}
        </div>
      )}
      <div ref={canvasWrapRef} className="relative inline-block" style={{ maxWidth: "100%" }}>
        {viewportSize.width > 0 && highlightRects.length > 0 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ width: viewportSize.width, height: viewportSize.height }}
          >
            {highlightRects.map((r, i) => (
              <div
                key={i}
                className="absolute bg-amber-400/50 rounded-sm"
                style={{
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getHighlightRects(textContent, keyword, viewport) {
  const items = textContent?.items || [];
  if (!items.length || !keyword) return [];

  const fullText = items.map((it) => it.str || "").join("");
  const lower = keyword.toLowerCase();
  const lowerFull = fullText.toLowerCase();
  const matches = [];
  let pos = 0;
  while (true) {
    const found = lowerFull.indexOf(lower, pos);
    if (found === -1) break;
    matches.push([found, found + keyword.length]);
    pos = found + 1;
  }
  if (!matches.length) return [];

  const itemStarts = [0];
  for (let i = 0; i < items.length; i++) {
    itemStarts.push(itemStarts[i] + (items[i].str || "").length);
  }

  const rects = [];
  for (const [start, end] of matches) {
    for (let i = 0; i < items.length; i++) {
      const iStart = itemStarts[i];
      const iEnd = itemStarts[i + 1];
      if (iEnd <= start || iStart >= end) continue;
      const segStart = Math.max(0, start - iStart);
      const segEnd = Math.min((items[i].str || "").length, end - iStart);
      if (segStart >= segEnd) continue;

      const item = items[i];
      const str = item.str || "";
      const len = str.length;
      const tx = item.transform[4];
      const ty = item.transform[5];
      const w = item.width ?? 0;
      const h = item.height ?? 0;
      const scaleX = item.transform[0];
      const scaleY = item.transform[3];
      const itemWidth = w * (scaleX || 1);
      const itemHeight = h * (scaleY || 1);

      const lines = str.split("\n");
      let numLines = lines.length;
      if (numLines <= 1 && len > 0 && itemHeight > 0 && itemWidth > 0) {
        const avgCharWidth = itemWidth / len;
        const estimatedLineHeight = Math.max(avgCharWidth * 0.8, itemHeight / 20);
        const estimatedLines = Math.round(itemHeight / estimatedLineHeight);
        if (estimatedLines > 1) numLines = Math.min(estimatedLines, Math.max(2, Math.ceil(len / 15)));
      }
      const lineHeight = numLines > 0 ? itemHeight / numLines : itemHeight;
      const lineStarts = [];
      let idx = 0;
      for (let k = 0; k < lines.length; k++) {
        lineStarts.push(idx);
        idx += lines[k].length;
        if (k < lines.length - 1) idx += 1;
      }
      if (numLines > lines.length) {
        const charsPerLine = Math.ceil(len / numLines);
        lineStarts.length = 0;
        for (let k = 0; k < numLines; k++) {
          lineStarts.push(k * charsPerLine);
        }
        lineStarts.push(len);
      }

      const lineIndices = new Set();
      for (let ci = segStart; ci < segEnd; ci++) {
        let li = 0;
        for (; li < lineStarts.length - 1; li++) {
          if (ci < lineStarts[li + 1]) break;
        }
        lineIndices.add(Math.min(li, lineStarts.length - 1));
      }

      for (const lineIndex of lineIndices) {
        const lineStartChar = lineStarts[lineIndex];
        const lineEndChar = lineIndex + 1 < lineStarts.length ? lineStarts[lineIndex + 1] : len;
        const lineSegStart = Math.max(segStart, lineStartChar);
        const lineSegEnd = Math.min(segEnd, lineEndChar);
        if (lineSegStart >= lineSegEnd) continue;

        const charsInLine = lineEndChar - lineStartChar;
        const offsetInLine = lineSegStart - lineStartChar;
        const segLenInLine = lineSegEnd - lineSegStart;
        const lineWidth =
          charsInLine > 0 ? (charsInLine / len) * itemWidth : itemWidth;
        const segLeft =
          charsInLine > 0
            ? tx + (offsetInLine / charsInLine) * lineWidth
            : tx + (lineSegStart / len) * itemWidth;
        const segW =
          charsInLine > 0
            ? (segLenInLine / charsInLine) * lineWidth
            : (segLenInLine / len) * itemWidth;

        const yMax = ty - lineIndex * lineHeight;
        const yMin = ty - (lineIndex + 1) * lineHeight;
        const pdfRect = [segLeft, yMin, segLeft + segW, yMax];
        const screenRect = viewport.convertToViewportRectangle(pdfRect);
        const left = Math.min(screenRect[0], screenRect[2]);
        const top = Math.min(screenRect[1], screenRect[3]);
        const width = Math.abs(screenRect[2] - screenRect[0]);
        const height = Math.abs(screenRect[3] - screenRect[1]);
        const tooTall = height > viewport.height * 0.5;
        if (width > 0 && height > 0 && !tooTall) {
          rects.push({ left, top, width, height });
        }
      }
    }
  }
  return rects;
}
