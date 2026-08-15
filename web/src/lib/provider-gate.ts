import type { Profile, ServiceProviderProfile } from "@/lib/types";
import { db } from "@/lib/store";

/** Mirror Django `_is_provider_blocked` — unverified/suspended providers cannot mint JWTs. */
export async function assertProviderCanLogin(profile: Profile): Promise<void> {
  if (profile.role !== "provider") return;

  const provider = (await db.getProviderByUser(profile.id)) as ServiceProviderProfile | null;
  // No profile yet → allow login so they can finish onboarding (Django behavior).
  if (!provider) return;

  if (provider.is_suspended) {
    throw Object.assign(
      new Error(
        "Your provider account has been suspended. Please contact support.",
      ),
      { status: 403, code: "provider_not_verified" },
    );
  }
  if (!provider.verified) {
    throw Object.assign(
      new Error(
        "Your provider profile is awaiting verification by an admin. You'll be able to log in once it's approved.",
      ),
      { status: 403, code: "provider_not_verified" },
    );
  }
}
