import { Suspense } from "react";
import { FreshOnShow } from "@/components/FreshOnShow";
import { ExerciseScreen } from "@/screens/ExerciseScreen";

export default function Page() {
  return (
    <FreshOnShow>
      <Suspense
        fallback={
          <main className="page" aria-busy="true">
            <p className="lead">Готовим упражнение</p>
          </main>
        }
      >
        <ExerciseScreen />
      </Suspense>
    </FreshOnShow>
  );
}
