import { getServerCommitSha } from "@/lib/system/version";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    sha: getServerCommitSha(),
  });
}
