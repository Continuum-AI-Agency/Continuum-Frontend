import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  // Get the Authorization header from the incoming request
  const authHeader = request.headers.get("Authorization");

  try {
    // Call the existing Supabase edge function for ad accounts
    // This filters based on DCO campaign actions
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-ad-accounts-for-selector?brandId=${encodeURIComponent(brandId)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader && { 'Authorization': authHeader }),
        },
      }
    );

    if (!response.ok) {
      console.error("Edge function error:", response.status, response.statusText);
      const errorText = await response.text();
      console.error("Edge function error response:", errorText);
      return NextResponse.json({ error: "Failed to fetch ad accounts" }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected error in ad-accounts API:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}