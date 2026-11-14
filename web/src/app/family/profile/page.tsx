import { Suspense } from "react";
import { ProfileScreen } from "@/screens/FamilyScreens";

export default function Page() {
  return (
    <Suspense fallback={<main className="page" aria-busy="true" />}>
      <ProfileScreen />
    </Suspense>
  );
}
