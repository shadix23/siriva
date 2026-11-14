import { Suspense } from "react";
import { FamilyScreen } from "@/screens/FamilyScreens";

export default function Page() {
  return (
    <Suspense fallback={<main className="page" aria-busy="true" />}>
      <FamilyScreen />
    </Suspense>
  );
}
