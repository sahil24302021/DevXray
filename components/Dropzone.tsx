"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DropzoneProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export default function Dropzone({ onFileSelect, isLoading }: DropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (isLoading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndPassFile(droppedFile);
      e.dataTransfer.clearData();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndPassFile(e.target.files[0]);
    }
  };

  const validateAndPassFile = (file: File) => {
    // accept pdf or docx, maybe simple txt
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!allowed.includes(file.type) && !file.name.endsWith(".pdf") && !file.name.endsWith(".docx")) {
      alert("Please upload a PDF or DOCX file.");
      return;
    }
    onFileSelect(file);
  };

  return (
    <div
      className="relative w-full max-w-lg mt-12 mx-auto sm:mx-0"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.docx,application/pdf"
        className="hidden"
      />

      <motion.div
        animate={{
          scale: isDragActive ? 1.02 : 1,
          borderColor: isDragActive ? "rgba(205,255,0,0.5)" : "rgba(255,255,0,0.06)",
        }}
        className="relative group overflow-hidden rounded-2xl border cursor-pointer border-white/[0.06] p-8 text-center"
        style={{
          background: isDragActive ? "rgba(205,255,0,0.02)" : "rgba(5,5,5,0.4)",
          backdropFilter: "blur(20px)",
        }}
        onClick={() => {
          if (!isLoading) fileInputRef.current?.click();
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        {/* Glow behind dropzone on active */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#cdff00]/10 blur-[50px] rounded-full pointer-events-none transition-opacity duration-300"
          style={{ opacity: isDragActive ? 1 : 0 }}
        />

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.05] group-hover:border-[#cdff00]/30 transition-colors">
            {isLoading ? (
               <motion.div
                 animate={{ rotate: 360 }}
                 transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                 className="w-5 h-5 border-2 border-[#050505] border-t-[#cdff00] rounded-full"
               />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#cdff00]">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
          </div>
          
          <div>
            <h3 className="text-white font-[family-name:var(--font-syne)] font-bold text-lg mb-1">
              {isLoading ? "Analyzing..." : "Upload Resume"}
            </h3>
            <p className="text-sm text-[#777] font-light max-w-[250px] mx-auto">
              {isLoading 
                ? "Extracting intelligence & cross-referencing..." 
                : "Drag & drop a PDF, or click to browse. Max 5MB."}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
