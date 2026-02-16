import { loadTokens } from "@argus/tiktok";
import TikTokConnect from "@/components/TikTokConnect";
import TikTokPostForm from "@/components/TikTokPostForm";

export const dynamic = "force-dynamic";

export default async function TikTokPage() {
  const tokens = await loadTokens();
  const isConnected = !!tokens;

  return (
    <main className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Post to TikTok</h1>
      {isConnected ? <TikTokPostForm /> : <TikTokConnect />}
    </main>
  );
}
