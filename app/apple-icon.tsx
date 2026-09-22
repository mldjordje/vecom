import { ImageResponse } from "next/og";

// iOS ne čita ikone iz manifesta — traži apple-touch-icon
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2E2B26",
          color: "#F7F6F2",
          fontSize: 104,
          fontWeight: 600,
        }}
      >
        V
      </div>
    ),
    size
  );
}
