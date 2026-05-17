"use client";

import JSZip from "jszip";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_RECIPE } from "@/lib/constants";
import { exportVideo, FFmpegLoadError, loadFFmpeg, terminateFFmpeg } from "@/lib/ffmpeg";
import { EditRecipe, ExportResult, ExportStatus } from "@/lib/types";

const DEFAULT_TITLE = "Reframe - Resize, trim, and export videos in your browser";

export function extractMetadata(
  file: File,
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: isFinite(video.duration) ? video.duration : 0,
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video metadata"));
    };
    video.src = url;
  });
}

function verifyMagicBytes(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onloadend = (event) => {
      if (!event.target?.result) {
        resolve(false);
        return;
      }

      const bytes = new Uint8Array(event.target.result as ArrayBuffer);
      const hex = Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      const ascii = String.fromCharCode(...bytes);

      if (hex.startsWith("1A45DFA3")) resolve(true);
      else if (hex.startsWith("52494646")) resolve(true);
      else if (ascii.substring(0, 12).includes("ftyp")) resolve(true);
      else resolve(false);
    };

    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, 12));
  });
}

export function useVideoEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [recipe, setRecipe] = useState<EditRecipe>(DEFAULT_RECIPE);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [currentPreset, setCurrentPreset] = useState("");
  const [currentExportIndex, setCurrentExportIndex] = useState(0);
  const [totalExports, setTotalExports] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const exportCancelledRef = useRef(false);

  const updateRecipe = useCallback((patch: Partial<EditRecipe>) => {
    setRecipe((prev) => ({ ...prev, ...patch }));
  }, []);

  const togglePreset = useCallback((presetId: string) => {
    setSelectedPresets((prev) =>
      prev.includes(presetId)
        ? prev.filter((id) => id !== presetId)
        : [...prev, presetId],
    );
  }, []);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setResult(null);
    setStatus("idle");
    setError(null);
    setFile(null);

    

    // LAYER 1: Extension check
    const validExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    const filename = selectedFile.name.toLowerCase();
    const hasValidExtension = validExtensions.some(ext => filename.endsWith(ext));
    if (!hasValidExtension) {
      setError(
        `Layer 1 Validation Failed: Invalid file extension. Expected one of: ${validExtensions.join(", ")}`,
      );
      setStatus("error");
      return;
    }

    if (!selectedFile.type.startsWith("video/")) {
      setError(
        `Layer 2 Validation Failed: Invalid MIME type. Expected video/*, got ${selectedFile.type || "unknown"}`,
      );
      setStatus("error");
      return;
    }

    const isVideo = await verifyMagicBytes(selectedFile);
    if (!isVideo) {
      setError(
        "Layer 3 Validation Failed: Invalid file content. The file's magic bytes do not match known video formats.",
      );
      setStatus("error");
      return;
    }

    try {
      const { duration: videoDuration } = await extractMetadata(selectedFile);
      setDuration(videoDuration);
      setFile(selectedFile);
      setRecipe((prev) => ({ ...prev, trimStart: 0, trimEnd: null }));
    } catch (err) {
      setError(
        `Layer 4 Validation Failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      );
      setStatus("error");
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!file) return;
    if (status === "loading-engine" || status === "exporting") return;

    const abortController = new AbortController();
    exportAbortControllerRef.current = abortController;
    exportCancelledRef.current = false;

    try {
      setStatus("loading-engine");
      setProgress(0);
      setError(null);
      if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
      setResult(null);

      const ffmpeg = await loadFFmpeg(abortController.signal);
      if (exportCancelledRef.current) return;

      setStatus("exporting");

      const exportResult = await exportVideo(
        ffmpeg,
        file,
        recipe,
        setProgress,
        abortController.signal,
      );
      if (exportCancelledRef.current) return;

      setResult(exportResult);
      setStatus("done");
    } catch (err) {
      if (exportCancelledRef.current) return;

      console.error("export failed:", err);
      if (err instanceof FFmpegLoadError) {
        setError(err.message);
      } else if (err instanceof Error && err.message.includes("network")) {
        setError("Network error. Check your internet connection and try again.");
      } else if (err instanceof Error && err.message.includes("codec")) {
        setError("This video format is not supported. Try converting to MP4 first.");
      } else {
        setError("Export failed. Please try again or use a different video.");
      }
      setStatus("error");
    } finally {
      if (exportAbortControllerRef.current === abortController) {
        exportAbortControllerRef.current = null;
      }
    }
  }, [file, recipe, result, status]);

  const handleBatchExport = useCallback(async () => {
    if (!file || selectedPresets.length === 0) return;
    if (status === "loading-engine" || status === "exporting") return;

    const abortController = new AbortController();
    exportAbortControllerRef.current = abortController;
    exportCancelledRef.current = false;

    try {
      setStatus("loading-engine");
      setProgress(0);
      setError(null);
      setCurrentPreset("");
      setCurrentExportIndex(0);
      setTotalExports(selectedPresets.length);

      const ffmpeg = await loadFFmpeg(abortController.signal);
      if (exportCancelledRef.current) return;

      setStatus("exporting");

      const zip = new JSZip();
      const baseName = file.name.replace(/\.[^/.]+$/, "");

      for (let index = 0; index < selectedPresets.length; index += 1) {
        if (exportCancelledRef.current) return;

        const presetId = selectedPresets[index];
        setCurrentPreset(presetId);
        setCurrentExportIndex(index + 1);
        setProgress(0);

        const exportResult = await exportVideo(
          ffmpeg,
          file,
          {
            ...recipe,
            preset: presetId,
          },
          setProgress,
          abortController.signal,
        );

        const blob = await fetch(exportResult.blobUrl).then((response) =>
          response.blob(),
        );
        zip.file(`${baseName}-${presetId}.${exportResult.format}`, blob);
        URL.revokeObjectURL(exportResult.blobUrl);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");

      anchor.href = zipUrl;
      anchor.download = `${baseName}-exports.zip`;
      anchor.click();
      URL.revokeObjectURL(zipUrl);

      setStatus("done");
    } catch (err) {
      if (exportCancelledRef.current) return;

      console.error("batch export failed:", err);
      setError(err instanceof Error ? err.message : "Batch export failed");
      setStatus("error");
    } finally {
      if (exportAbortControllerRef.current === abortController) {
        exportAbortControllerRef.current = null;
      }
      setCurrentPreset("");
      setCurrentExportIndex(0);
      setTotalExports(0);
    }
  }, [file, recipe, selectedPresets, status]);

  useEffect(() => {
    if (file) {
      document.title = `Editing: ${file.name} | Reframe`;
    } else {
      document.title = DEFAULT_TITLE;
    }

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [file]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter" &&
        file &&
        status !== "loading-engine" &&
        status !== "exporting"
      ) {
        handleExport();
      }
    };

    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [file, status, handleExport]);

  const cancelExport = useCallback(() => {
    exportCancelledRef.current = true;
    exportAbortControllerRef.current?.abort();
    exportAbortControllerRef.current = null;
    terminateFFmpeg();
    setStatus("idle");
    setProgress(0);
    setCurrentPreset("");
    setCurrentExportIndex(0);
    setTotalExports(0);
    setError(null);
  }, []);

  const resetSettings = useCallback(() => {
    setRecipe(DEFAULT_RECIPE);
  }, []);

  const reset = useCallback(() => {
    if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
    setFile(null);
    setDuration(0);
    setRecipe(DEFAULT_RECIPE);
    setStatus("idle");
    setProgress(0);
    setResult(null);
    setError(null);
    setSelectedPresets([]);
    setCurrentPreset("");
    setCurrentExportIndex(0);
    setTotalExports(0);
  }, [result]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (status !== "exporting") return;

    const interval = setInterval(() => {
      const mem = (
        performance as Performance & {
          memory?: { usedJSHeapSize: number };
        }
      ).memory;

      if (mem) {
        console.log("[Reframe Memory]", Math.round(mem.usedJSHeapSize / 1e6), "MB used");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  return {
    file,
    duration,
    recipe,
    status,
    progress,
    result,
    error,
    updateRecipe,
    handleFileSelect,
    handleExport,
    handleBatchExport,
    cancelExport,
    reset,
    selectedPresets,
    togglePreset,
    currentPreset,
    currentExportIndex,
    totalExports,
    resetSettings,
  };
}
