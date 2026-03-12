"use client";

import { useMemo } from "react";

interface RGBColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export function RGBColorPicker({ value, onChange, disabled }: RGBColorPickerProps) {
  // Parse hex to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 255, g: 0, b: 0 };
  };

  // Convert RGB to hex
  const rgbToHex = (r: number, g: number, b: number) => {
    return (
      "#" +
      [r, g, b]
        .map((x) => {
          const hex = Math.max(0, Math.min(255, x)).toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  };

  const rgb = useMemo(() => hexToRgb(value), [value]);

  const handleChange = (channel: "r" | "g" | "b", newValue: number) => {
    const updatedRgb = { ...rgb, [channel]: newValue };
    onChange(rgbToHex(updatedRgb.r, updatedRgb.g, updatedRgb.b));
  };

  const presetColors = [
    "#FF0000", "#00FF00", "#0000FF", "#FFFF00",
    "#FF00FF", "#00FFFF", "#FFA500", "#800080",
  ];

  return (
    <div className={`space-y-4 ${disabled ? "opacity-50" : ""}`}>
      {/* Color Preview */}
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-xl border-2 border-zinc-700 shadow-lg shrink-0"
          style={{ backgroundColor: value }}
        />
        <div className="flex-1 space-y-2">
          {/* HEX Input */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">#</span>
            <input
              type="text"
              value={value.replace("#", "").toUpperCase()}
              onChange={(e) => {
                const hex = e.target.value.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
                if (hex.length === 6) {
                  onChange("#" + hex);
                }
              }}
              disabled={disabled}
              className="w-24 px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono text-white uppercase focus:outline-none focus:border-cyan-500/50"
              maxLength={6}
            />
          </div>
          <p className="text-xs text-zinc-500 font-mono">
            rgb({rgb.r}, {rgb.g}, {rgb.b})
          </p>
        </div>
      </div>

      {/* RGB Sliders */}
      <div className="space-y-3 bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
        {/* Red */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-red-400 font-medium">Red</span>
            <span className="text-zinc-500 font-mono">{rgb.r}</span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            value={rgb.r}
            onChange={(e) => handleChange("r", parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400 transition-all"
            style={{
              background: `linear-gradient(to right, #1f1f23 0%, #ef4444 ${(rgb.r / 255) * 100}%, #1f1f23 ${(rgb.r / 255) * 100}%)`,
            }}
          />
        </div>

        {/* Green */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-green-400 font-medium">Green</span>
            <span className="text-zinc-500 font-mono">{rgb.g}</span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            value={rgb.g}
            onChange={(e) => handleChange("g", parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500 hover:accent-green-400 transition-all"
            style={{
              background: `linear-gradient(to right, #1f1f23 0%, #22c55e ${(rgb.g / 255) * 100}%, #1f1f23 ${(rgb.g / 255) * 100}%)`,
            }}
          />
        </div>

        {/* Blue */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-blue-400 font-medium">Blue</span>
            <span className="text-zinc-500 font-mono">{rgb.b}</span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            value={rgb.b}
            onChange={(e) => handleChange("b", parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
            style={{
              background: `linear-gradient(to right, #1f1f23 0%, #3b82f6 ${(rgb.b / 255) * 100}%, #1f1f23 ${(rgb.b / 255) * 100}%)`,
            }}
          />
        </div>
      </div>

      {/* Preset Colors */}
      <div>
        <p className="text-xs text-zinc-500 mb-2">Cores rápidas</p>
        <div className="flex flex-wrap gap-2">
          {presetColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              disabled={disabled}
              className={`w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 ${
                value.toLowerCase() === color.toLowerCase()
                  ? "border-white ring-2 ring-cyan-500/50"
                  : "border-transparent hover:border-zinc-400"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
