import { Suspense } from "react";
import { FreshOnShow } from "@/components/FreshOnShow";
import { ConsentScreen } from "@/screens/ConsentScreen";

export default function Page() {
  return (
    <FreshOnShow>
      <Suspense fallback={<main className="page" aria-busy="true" />}>
        <ConsentScreen />
      </Suspense>
    </FreshOnShow>
  );
}
