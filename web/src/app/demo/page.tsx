import { Suspense } from "react";
import { DemoScreen } from "@/screens/DemoScreen";

export default function Page() {
  return (
    <Suspense fallback={<main className="demo-main" aria-busy="true" />}>
      <DemoScreen />
    </Suspense>
  );
}
