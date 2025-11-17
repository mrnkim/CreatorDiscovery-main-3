import React from "react";
import clsx from "clsx";
import { IBM_Plex_Mono } from "next/font/google";

interface Bucket {
  start: number;
  end: number;
  value: number;
  brands?: string[];
}

interface HeatmapRow {
  id: string;
  label?: string;
  buckets: Bucket[];
  videoDuration?: number; // Optional video duration for this specific row
}

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

interface HeatmapProps {
  rows: HeatmapRow[];
  columns: number;
  onCellClick?: (rowId: string, colIndex: number) => void;
  className?: string;
  colorHue?: number; // Optional hue value for HSL color (default: 0 - neutral for zinc)
  videoDuration?: number; // Optional video duration for accurate bucket duration calculation
  viewMode?: "library" | "per-video"; // View mode to determine tooltip content
}

/**
 * Heatmap component for visualizing time-based data intensity
 *
 * Renders a grid with rows representing entities (brands, products, videos)
 * and columns representing time buckets. Cell color intensity indicates value.
 */
const Heatmap: React.FC<HeatmapProps> = ({
  rows,
  columns,
  onCellClick,
  className,
  colorHue = 0, // Default to neutral for zinc colors
  videoDuration,
  viewMode = "per-video", // Default to per-video view
}) => {
  // Function to find which bucket corresponds to a column index
  const findBucketForColumn = (
    buckets: Bucket[],
    colIndex: number
  ): Bucket | null => {
    const normalizedPosition = colIndex / columns;
    const position = normalizedPosition * 100; // As percentage

    return (
      buckets.find((bucket) => {
        // Check if position falls within bucket range
        return position >= bucket.start && position <= bucket.end;
      }) || null
    );
  };

  // Function to normalize values per row and get color using zinc colors
  const getColorForValue = (value: number, maxValue: number): string => {
    if (maxValue === 0) return "rgba(255, 255, 255, 1)"; // White for zero values

    // Normalize value between 0 and 1
    const normalizedValue = Math.min(value / maxValue, 1);

    // Map to zinc color scale based on intensity
    if (normalizedValue <= 0.1) return "rgba(255, 255, 255, 1)";
    if (normalizedValue <= 0.2) return "rgba(29, 28, 27, 0.1)";
    if (normalizedValue <= 0.3) return "rgba(29, 28, 27, 0.2)";
    if (normalizedValue <= 0.4) return "rgba(29, 28, 27, 0.3)";
    if (normalizedValue <= 0.5) return "rgba(29, 28, 27, 0.4)";
    if (normalizedValue <= 0.6) return "rgba(29, 28, 27, 0.6)";
    if (normalizedValue <= 0.7) return "rgba(29, 28, 27, 0.7)";
    if (normalizedValue <= 0.8) return "rgba(29, 28, 27, 0.8)";
    if (normalizedValue <= 0.9) return "rgba(29, 28, 27, 0.9)";
    return "rgba(29, 28, 27, 1)"; // Darkest for highest values
  };

  return (
    <div
      className={clsx(
        "w-full overflow-x-auto overflow-y-hidden border border-1 border-gray-300 rounded-xl",
        ibmPlexMono.className,
        className
      )}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `160px repeat(${columns}, 28px)`,
        }}
        role="grid"
        aria-label="Heatmap visualization"
      >
        {/* Header row with column numbers */}
        <div
          className="bg-zinc-100 h-7 font-medium text-sm border-b border-r border-gray-300 sticky left-0 z-20"
          role="columnheader"
        >
          {/* Empty cell for top-left corner */}
        </div>

        {/* Column headers */}
        {Array.from({ length: columns }).map((_, colIndex) => (
          <div
            key={`col-${colIndex}`}
            className="w-7 h-7 flex items-center justify-center text-xs text-center border-b border-r border-gray-300"
            role="columnheader"
          >
            {Math.round((colIndex / columns) * 100)}%
          </div>
        ))}

        {/* Data rows */}
        {rows.map((row) => {
          // Find max value in this row for normalization
          const maxValue = Math.max(...row.buckets.map((b) => b.value), 0.1); // Avoid division by zero

          return (
            <React.Fragment key={row.id}>
              {/* Row label */}
              <div
                className="pl-3 flex items-center font-normal text-xs text-gray-700 bg-zinc-100 border-b border-r border-gray-300 truncate sticky left-0 bg-white z-10 h-7"
                role="rowheader"
                title={row.label || row.id}
              >
                {row.label || row.id}
              </div>

              {/* Row cells */}
              {Array.from({ length: columns }).map((_, colIndex) => {
                // Direct index mapping instead of using findBucketForColumn
                const bucket = row.buckets[colIndex];
                const value = bucket?.value || 0;
                const backgroundColor = getColorForValue(value, maxValue);

                return (
                  <div
                    key={`${row.id}-${colIndex}`}
                    className={clsx(
                      "border-b border-r border-gray-300 min-w-0 w-7 h-7",
                      onCellClick && row.id !== "__TOTAL__"
                        ? "cursor-pointer hover:opacity-80"
                        : ""
                    )}
                    style={{ backgroundColor, minWidth: "28px", width: "28px" }}
                    role="gridcell"
                    onClick={() =>
                      row.id !== "__TOTAL__" && onCellClick?.(row.id, colIndex)
                    }
                    aria-label={`Duration ${Math.round(
                      value
                    )}s at position ${colIndex}`}
                    title={
                      bucket
                        ? (() => {
                            if (viewMode === "library") {
                              // Library view: show only brand names
                              if (bucket.brands && bucket.brands.length > 0) {
                                return `Brands: ${bucket.brands.join(", ")}`;
                              }
                              return "No brands detected";
                            } else {
                              // Per-video view: show duration and brands
                              // Calculate the actual playback duration using the same logic as the click handler
                              let playbackDuration = 0;

                              // Use row-specific video duration if available, otherwise fall back to global videoDuration
                              const currentVideoDuration =
                                row.videoDuration || videoDuration;

                              if (currentVideoDuration) {
                                const bucketDuration =
                                  ((bucket.end - bucket.start) / 100) *
                                  currentVideoDuration;
                                const eventDuration = value; // This is the event duration from the bucket value

                                // Apply the same logic as in the click handler
                                if (
                                  eventDuration >
                                  currentVideoDuration * 0.8
                                ) {
                                  // For events that span most of the video, use a 10-second segment
                                  playbackDuration = 10;
                                } else if (
                                  bucketDuration <
                                  eventDuration * 0.3
                                ) {
                                  // For very small buckets compared to event, use bucket boundaries
                                  playbackDuration = bucketDuration;
                                } else {
                                  // Otherwise, use the full event duration
                                  playbackDuration = eventDuration;
                                }
                              } else {
                                // Fallback: use the event duration
                                playbackDuration = value;
                              }

                              const duration = `Duration: ${Math.round(
                                playbackDuration
                              )}s`;
                              if (bucket.brands && bucket.brands.length > 0) {
                                return `${duration}\nBrands: ${bucket.brands.join(
                                  ", "
                                )}`;
                              }
                              return duration;
                            }
                          })()
                        : "No data"
                    }
                    tabIndex={
                      onCellClick && row.id !== "__TOTAL__" ? 0 : undefined
                    }
                    onKeyDown={(e) => {
                      if (
                        onCellClick &&
                        row.id !== "__TOTAL__" &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        onCellClick(row.id, colIndex);
                        e.preventDefault();
                      }
                    }}
                  >
                    <div className="w-full h-8"></div>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default Heatmap;
