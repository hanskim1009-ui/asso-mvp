"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrText, setOcrText] = useState(null);
  const fileInputRef = useRef(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadMessage(null);
      setUploadError(null);
    }
    e.target.value = "";
  };

  const uploadToSupabase = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    setOcrText(null);

    const fileExt = selectedFile.name.split(".").pop();
    const fileName = `${Date.now()}.${fileExt}`;

    try {
      // 1. Supabase에 업로드
      const { data: uploadData, error } = await supabase.storage
        .from("documents")
        .upload(fileName, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      setUploadMessage("업로드 완료!");
      setIsUploading(false);

      // 2. OCR 처리 시작 - FormData로 파일 직접 전송
      setIsProcessing(true);

      const formData = new FormData();
      formData.append('document', selectedFile);

      const ocrRes = await fetch("/api/ocr", {
        method: "POST",
        body: formData,  // JSON 대신 FormData!
      });

      const ocrJson = await ocrRes.json();

      if (!ocrRes.ok) {
        throw new Error(ocrJson.error ?? "OCR 처리에 실패했습니다.");
      }

      if (ocrJson.success && ocrJson.text != null) {
        setOcrText(ocrJson.text);
      }
      
      setSelectedFile(null);
      
    } catch (err) {
      setUploadError(err?.message ?? "업로드에 실패했습니다.");
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans">
      {/* 상단 헤더 - 네이비 배경 */}
      <header className="flex h-14 shrink-0 items-center px-6 bg-[#1e3a5f]">
        <span className="text-xl font-bold tracking-tight text-white">
          ASSO
        </span>
      </header>

      {/* 메인 영역 - 흰색 배경 */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <h1 className="mb-4 text-center text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          수사기록 분석 시작하기
        </h1>
        <p className="mb-10 max-w-md text-center text-lg text-zinc-600">
          PDF 파일을 업로드하면 AI가 자동으로 분석합니다
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden
        />
        <button
          type="button"
          onClick={handleButtonClick}
          disabled={isUploading || isProcessing}
          className="rounded-lg bg-blue-600 px-8 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          PDF 업로드
        </button>

        {selectedFile && !isUploading && !isProcessing && (
          <button
            type="button"
            onClick={uploadToSupabase}
            className="mt-4 rounded-lg border border-blue-600 bg-white px-6 py-2 text-base font-medium text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Supabase에 업로드하기
          </button>
        )}

        {selectedFile && (
          <p className="mt-6 text-center text-zinc-600">
            선택한 파일: <span className="font-medium text-zinc-900">{selectedFile.name}</span>
          </p>
        )}

        {isUploading && (
          <p className="mt-4 text-center text-blue-600 font-medium">업로드 중...</p>
        )}
        {isProcessing && (
          <p className="mt-4 text-center text-amber-600 font-medium">OCR 처리 중...</p>
        )}
        {uploadMessage && !isProcessing && (
          <p className="mt-4 text-center text-green-600 font-medium">{uploadMessage}</p>
        )}
        {uploadError && (
          <p className="mt-4 text-center text-red-600 font-medium" role="alert">
            {uploadError}
          </p>
        )}

        {ocrText && (
          <div className="mt-10 w-full max-w-2xl">
            <h2 className="mb-2 text-left text-lg font-semibold text-zinc-900">
              추출된 텍스트
            </h2>
            <textarea
              readOnly
              value={ocrText}
              rows={12}
              className="w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="OCR 추출 텍스트"
            />
          </div>
        )}
      </main>
    </div>
  );
}