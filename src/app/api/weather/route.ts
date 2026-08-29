import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat") || "37.5665";
    const lon = searchParams.get("lon") || "126.9780";
    // Open-Meteo free API, no key needed
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5`;
    const res = await fetch(url, { next: { revalidate: 600 } });
    const data = await res.json();

    // Map weather code to description
    const codeMap: Record<number, string> = {
      0: "맑음", 1: "대체로 맑음", 2: "부분 흐림", 3: "흐림",
      45: "안개", 48: "서리 안개", 51: "가벼운 이슬비", 53: "이슬비", 55: "강한 이슬비",
      61: "약한 비", 63: "비", 65: "강한 비", 71: "약한 눈", 73: "눈", 75: "강한 눈",
      80: "약한 소나기", 81: "소나기", 82: "강한 소나기", 95: "천둥번개", 96: "우박",
    };

    return NextResponse.json({
      current: {
        temp: data.current?.temperature_2m,
        feels: data.current?.apparent_temperature,
        humidity: data.current?.relative_humidity_2m,
        wind: data.current?.wind_speed_10m,
        code: data.current?.weather_code,
        desc: codeMap[data.current?.weather_code] || "알 수 없음",
        time: data.current?.time,
      },
      daily: data.daily ? data.daily.time.map((t: string, i: number) => ({
        date: t,
        max: data.daily.temperature_2m_max[i],
        min: data.daily.temperature_2m_min[i],
        code: data.daily.weather_code[i],
        desc: codeMap[data.daily.weather_code[i]] || "-",
        precip: data.daily.precipitation_probability_max[i],
      })) : [],
      raw: data,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
