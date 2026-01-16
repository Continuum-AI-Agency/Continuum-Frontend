import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  const adAccountId = searchParams.get("adAccountId");
  const platform = searchParams.get("platform");

  if (!brandId || !adAccountId) {
    return NextResponse.json({ error: "brandId and adAccountId are required" }, { status: 400 });
  }

  try {
    // Get the Authorization header from the incoming request
    const authHeader = request.headers.get("Authorization");

    // Call the Supabase edge function
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-meta-campaigns?brandId=${encodeURIComponent(brandId)}&adAccountId=${encodeURIComponent(adAccountId)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader && { 'Authorization': authHeader }),
        },
      }
    );

    if (!response.ok) {
      console.error("Edge function error:", response.status, response.statusText);
      console.error("Request URL:", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-meta-campaigns?brandId=${encodeURIComponent(brandId)}&adAccountId=${encodeURIComponent(adAccountId)}`);
      console.error("Auth header present:", !!authHeader);
      const errorText = await response.text();
      console.error("Edge function error response:", errorText);
      return NextResponse.json({ error: `Failed to fetch campaigns: ${response.status} ${response.statusText}` }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected error in campaigns API:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}