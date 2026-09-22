import { ImageResponse } from "next/og";

// ikonica aplikacije: "V" na tamnoj pozadini; "m" na kraju = maskable (više prostora oko slova)
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const maskable = raw.endsWith("m");
  const size = Math.min(1024, Math.max(48, parseInt(raw, 10) || 192));
  const letter = Math.round(size * (maskable ? 0.42 : 0.58));

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
          fontSize: letter,
          fontWeight: 600,
          letterSpacing: -letter * 0.04,
        }}
      >
        V
      </div>
    ),
    { width: size, height: size }
  );
}
