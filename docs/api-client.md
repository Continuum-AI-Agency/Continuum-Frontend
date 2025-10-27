# API client usage

## Server (Route Handler / Server Action / RSC)

```ts
import { http } from "@/lib/api/http";

export async function GET() {
  const data = await http.request<{ status: string }>({ path: "/health", method: "GET" });
  return Response.json(data);
}
```

## Client (React Client Component)

```tsx
"use client";
import { useEffect, useState } from "react";
import { http } from "@/lib/api/http";

export function HealthBadge() {
  const [status, setStatus] = useState<string>("loading");
  useEffect(() => {
    http
      .request<{ status: string }>({ path: "/health", method: "GET" })
      .then(res => setStatus(res.status))
      .catch(() => setStatus("error"));
  }, []);
  return <span>{status}</span>;
}
```


