"use client";

import { Camera, CheckCircle2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

interface PhotoPickerProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  required?: boolean;
  compact?: boolean;
}

/**
 * Captura foto direto da câmera traseira no celular e comprime em JPEG leve
 * para upload rápido no Supabase Storage ou persistência offline/demo.
 */
export function PhotoPicker({
  value,
  onChange,
  label = "Anexar foto da câmera",
  required = false,
  compact = false,
}: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      const compressed = await compressImageToDataUrl(file, 960, 0.72);
      onChange(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = () => onChange(String(reader.result || ""));
      reader.readAsDataURL(file);
    } finally {
      setCompressing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {value ? (
        <div className="relative flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Evidência fotográfica"
            className="h-14 w-14 rounded-lg object-cover border border-emerald-200 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Foto anexada
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs text-emerald-700 underline mt-0.5"
            >
              Tirar outra
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remover foto"
            className="p-2 rounded-lg text-stone-500 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={compressing}
          className={`w-full flex items-center justify-center gap-2 rounded-xl border border-dashed transition active:scale-[0.99] ${
            required
              ? "border-orange-400 bg-orange-50/70 text-orange-800 hover:bg-orange-100/70"
              : "border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100"
          } ${compact ? "px-3 py-2 text-xs font-semibold" : "px-4 py-3 text-sm font-semibold"}`}
        >
          <Camera className="h-4 w-4 shrink-0" />
          <span>
            {compressing
              ? "Processando foto..."
              : required
                ? `${label} (obrigatória)`
                : label}
          </span>
        </button>
      )}
    </div>
  );
}

function compressImageToDataUrl(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * ratio));
      const height = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas indisponível"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}
