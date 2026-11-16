import { Hero } from "@/components/dashboard/hero";
import { RightRail } from "@/components/dashboard/right-rail";
import { Categories, FeatureCards, NewImages } from "@/components/dashboard/sections";
import { getActiveOrg, getCredits } from "@/lib/server-api";

export default async function Dashboard() {
  const { org } = await getActiveOrg();
  const credits = org ? ((await getCredits(org.id))?.data.available ?? null) : null;
  return (
    <div className="mx-auto grid max-w-[1880px] items-start gap-x-[23px] gap-y-[23px] px-[19px] pt-[18px] pb-[30px] xl:grid-cols-[minmax(0,1fr)_338px]">
      <main className="min-w-0">
        <Hero />
        <FeatureCards />
        <Categories />
        <NewImages />
      </main>
      <RightRail orgName={org?.name ?? "—"} role={org?.role ?? ""} credits={credits} />
    </div>
  );
}
