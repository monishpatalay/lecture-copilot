import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** The browser-tab icon: the sidebar's logo mark (lime circle, play triangle), drawn so it needs no font. */
export default function Icon() {
  return new ImageResponse(
    (
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="32" fill="#D9F26B" />
        <path d="M25 19v26l22-13z" fill="#16181D" />
      </svg>
    ),
    size,
  );
}
