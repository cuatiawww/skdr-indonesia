import { NextResponse } from "next/server";

// PR 016: no synthetic wind field. When the upstream GFS feed fails the route answers 503 and the map simply
// does not draw the wind layer (previously a sine-wave "fallbackWind" grid was shown as if it were real data).

export async function GET() {
  try {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch("https://opsroom.sipongidata.my.id/api/gfs", {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(timer);
    if (response.ok) {
      const payload = await response.json(),
        result =
          payload && typeof payload === "object" && "data" in payload
            ? payload.data
            : payload;
      if (Array.isArray(result)) {
        const uWind = result.find(
            (entry) =>
              entry?.header?.parameterNumber === 2 ||
              String(entry?.header?.parameterNumberName || "")
                .toLowerCase()
                .startsWith("u-component"),
          ),
          vWind = result.find(
            (entry) =>
              entry?.header?.parameterNumber === 3 ||
              String(entry?.header?.parameterNumberName || "")
                .toLowerCase()
                .startsWith("v-component"),
          );
        if (uWind && vWind) return NextResponse.json([uWind, vWind]);
      }
    }
  } catch {}
  return NextResponse.json({ error: "gfs_unavailable" }, { status: 503 });
}
