"use client";

import { PRESETS } from "@/lib/presets";
import { EditRecipe } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Lock, Settings2, Unlock } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
  selectedPresets: string[];
  togglePreset: (presetId: string) => void;
}

function getOrientationLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  const ratio = `${width / d}:${height / d}`;
  const orientation =
    width === height ? "Square" : width > height ? "Landscape" : "Portrait";

  return `${orientation} ${ratio}`;
}

function RatioBox({
  width,
  height,
  active,
}: {
  width: number;
  height: number;
  active: boolean;
}) {
  const max = 32;
  const ratio = width / height;
  const [boxWidth, boxHeight] =
    ratio >= 1
      ? [max, Math.max(4, Math.round(max / ratio))]
      : [Math.max(4, Math.round(max * ratio)), max];

  return (
    <div
      className={cn(
        "flex-shrink-0 border-2 transition-colors",
        active ? "border-film-600" : "border-[var(--muted)] opacity-60",
      )}
      style={{ width: boxWidth, height: boxHeight }}
    />
  );
}

export default function PresetSelector({
  recipe,
  onChange,
  selectedPresets,
  togglePreset,
}: Props) {
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const aspectRatioRef = useRef(16 / 9);

  const handleToggleLock = useCallback(() => {
    if (!lockedRef.current) {
      const width = recipe.customWidth ?? 1920;
      const height = recipe.customHeight ?? 1080;
      aspectRatioRef.current = height !== 0 ? width / height : 16 / 9;
    }

    setLocked((previousLocked) => {
      lockedRef.current = !previousLocked;
      return !previousLocked;
    });
  }, [recipe.customWidth, recipe.customHeight]);

  const handleWidthChange = useCallback(
    (width: number) => {
      const patch: Partial<EditRecipe> = { customWidth: width };

      if (lockedRef.current) {
        patch.customHeight = Math.round(width / aspectRatioRef.current);
      }

      onChange(patch);
    },
    [onChange],
  );

  const handleHeightChange = useCallback(
    (height: number) => {
      const patch: Partial<EditRecipe> = { customHeight: height };

      if (lockedRef.current) {
        patch.customWidth = Math.round(height * aspectRatioRef.current);
      }

      onChange(patch);
    },
    [onChange],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PRESETS.filter((preset) => preset.id !== "custom").map((preset) => {
          const active = selectedPresets.includes(preset.id);

          return (
            <button
              type="button"
              key={preset.id}
              onClick={() => {
                togglePreset(preset.id);
                onChange({ preset: preset.id });
              }}
              title={`${preset.label} - ${preset.width}x${preset.height} - ${getOrientationLabel(
                preset.width,
                preset.height,
              )}`}
              aria-label={`Select ${preset.label} preset, ${preset.width} by ${preset.height} pixels`}
              aria-pressed={active}
              className={cn(
                "flex min-h-[44px] min-w-[44px] cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-left transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]",
                active
                  ? "border-film-500 bg-film-50"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-film-300 hover:bg-film-50/30",
              )}
            >
              <input
                type="checkbox"
                checked={active}
                readOnly
                className="accent-film-600"
              />

              <RatioBox width={preset.width} height={preset.height} active={active} />

              <div className="min-w-0 flex-1 overflow-hidden">
                <p
                  className={cn(
                    "whitespace-nowrap font-heading text-xs font-bold leading-tight",
                    active ? "text-film-700" : "text-[var(--text)]",
                  )}
                >
                  {preset.label}
                </p>
                <p className="mt-0.5 truncate text-[10px] leading-tight text-[var(--muted)]">
                  {preset.platform}
                </p>
              </div>
            </button>
          );
        })}

        <button
          type="button"
          title="Custom - Set your own dimensions"
          aria-label="Select custom dimensions preset"
          aria-pressed={recipe.preset === "custom"}
          onClick={() => onChange({ preset: "custom" })}
          className={cn(
            "flex min-h-[44px] min-w-[44px] cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-left transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]",
            recipe.preset === "custom"
              ? "border-film-500 bg-film-50"
              : "border-[var(--border)] bg-[var(--surface)] hover:border-film-300 hover:bg-film-50/30",
          )}
        >
          <Settings2
            size={20}
            className={cn(
              "shrink-0",
              recipe.preset === "custom" ? "text-film-600" : "text-[var(--muted)]",
            )}
          />
          <div className="min-w-0">
            <p
              className={cn(
                "font-heading text-xs font-bold",
                recipe.preset === "custom" ? "text-film-700" : "text-[var(--text)]",
              )}
            >
              Custom
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--muted)]">Set your own</p>
          </div>
        </button>
      </div>

      {recipe.preset === "custom" && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 animate-fade-in">
          <div className="flex-1">
            <label
              htmlFor="custom-width"
              className="mb-1.5 block font-heading text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]"
            >
              Width px
            </label>
            <input
              id="custom-width"
              type="number"
              min={16}
              max={7680}
              step={2}
              value={recipe.customWidth}
              onChange={(event) => handleWidthChange(Number(event.target.value))}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-heading text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-film-400"
            />
            {recipe.customWidth % 2!==0 && (
              <p className="text-[10px] text-amber-500 mt-1">
                Warning - Odd number will round up to {recipe.customWidth + 1}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleLock}
            title={locked ? "Unlock aspect ratio" : "Lock aspect ratio"}
            className={cn(
              "mt-5 cursor-pointer rounded-md border p-1.5 transition-colors",
              locked
                ? "border-film-500 bg-film-50 text-film-600"
                : "border-[var(--border)] text-[var(--muted)] hover:border-film-300 hover:text-film-500",
            )}
          >
            {locked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>

          <div className="flex-1">
            <label
              htmlFor="custom-height"
              className="mb-1.5 block font-heading text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]"
            >
              Height px
            </label>
            <input
              id="custom-height"
              type="number"
              min={16}
              max={7680}
              step={2}
              value={recipe.customHeight}
              onChange={(event) => handleHeightChange(Number(event.target.value))}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-heading text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-film-400"
            />
            {recipe.customHeight %2!==0 && (
              <p className="text-[10px] text-amber-500 mt-1">
                Warning- Odd number will round up to {recipe.customHeight + 1}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
