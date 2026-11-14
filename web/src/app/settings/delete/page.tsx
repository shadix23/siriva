import { Suspense } from "react";
import { FreshOnShow } from "@/components/FreshOnShow";
import { DeleteScreen } from "@/screens/SimpleScreens";

export default function Page() {
  return (
    <FreshOnShow>
      <Suspense fallback={<main className="page" aria-busy="true" />}>
        <DeleteScreen />
      </Suspense>
    </FreshOnShow>
  );
}
