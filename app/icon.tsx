import { ImageResponse } from "next/og";

export const size = {
  width: 256,
  height: 256,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0d1117",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#238636",
            border: "12px solid #2ea043",
            borderRadius: 56,
            boxShadow: "0 18px 48px rgba(35, 134, 54, 0.35)",
            color: "white",
            display: "flex",
            fontSize: 92,
            fontWeight: 800,
            height: 176,
            justifyContent: "center",
            lineHeight: 1,
            width: 176,
          }}
        >
          M1
        </div>
      </div>
    ),
    size,
  );
}
