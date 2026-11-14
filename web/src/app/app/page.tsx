import { Suspense } from "react";
import { FreshOnShow } from "@/components/FreshOnShow";
import { TodayScreen } from "@/screens/TodayScreen";
import { SkeletonRows } from "@/components/ui";

export default function Page() {
  return (
    <FreshOnShow>
      <Suspense
        fallback={
          <main className="page" aria-busy="true">
            <p className="lead">Готовим программу на сегодня</p>
            <SkeletonRows />
          </main>
        }
      >
        <TodayScreen />
      </Suspense>
    </FreshOnShow>
  );
}
