import { db, snsPosts } from "@argus/db";
import { eq, desc } from "drizzle-orm";

async function main() {
  const posts = await db
    .select({
      id: snsPosts.id,
      platform: snsPosts.platform,
      status: snsPosts.status,
      postType: snsPosts.postType,
      currentPhase: snsPosts.currentPhase,
      createdAt: snsPosts.createdAt,
      updatedAt: snsPosts.updatedAt,
    })
    .from(snsPosts)
    .where(eq(snsPosts.platform, "tiktok"))
    .orderBy(desc(snsPosts.createdAt))
    .limit(3);

  console.log("=== TikTok Posts ===");
  for (const p of posts) {
    console.log(`ID: ${p.id}`);
    console.log(`  Status: ${p.status}`);
    console.log(`  Phase: ${p.currentPhase}`);
    console.log(`  Created: ${p.createdAt}`);
    console.log(`  Updated: ${p.updatedAt}`);
    console.log();
  }
  process.exit(0);
}
main();
