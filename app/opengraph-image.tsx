import { ImageResponse } from "next/og";

export const alt = "My First Commit social preview";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0d1117",
          color: "#f0f6fc",
          display: "flex",
          height: "100%",
          padding: 72,
          width: "100%",
        }}
      >
        <div
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 24,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            justifyContent: "space-between",
            padding: 56,
            width: "100%",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: 24 }}>
            <div
              style={{
                background: "#238636",
                border: "6px solid #2ea043",
                borderRadius: 22,
                height: 72,
                width: 72,
              }}
            />
            <div style={{ color: "#8b949e", fontSize: 34, fontWeight: 700 }}>
              My First Commit
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div
              style={{
                color: "#f0f6fc",
                fontSize: 86,
                fontWeight: 900,
                letterSpacing: 0,
                lineHeight: 0.95,
              }}
            >
              Discover your origin.
            </div>
            <div
              style={{
                color: "#8b949e",
                fontSize: 36,
                lineHeight: 1.25,
                maxWidth: 860,
              }}
            >
              Find and share the first public GitHub commit for any user.
            </div>
          </div>

          <div
            style={{
              alignItems: "center",
              color: "#3fb950",
              display: "flex",
              fontSize: 28,
              fontWeight: 700,
              gap: 16,
            }}
          >
            <div
              style={{
                background: "#3fb950",
                borderRadius: 6,
                height: 22,
                width: 22,
              }}
            />
            Public commit timeline
          </div>
        </div>
      </div>
    ),
    size,
  );
}
