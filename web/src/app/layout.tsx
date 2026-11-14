import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AnnouncerProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "Siriva: занятия для речи и памяти",
  description:
    "Короткие ежедневные упражнения на речь и память. Siriva замечает изменения по голосу и подбирает следующие упражнения. Не ставит диагноз.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F6F3EC",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <AnnouncerProvider>{children}</AnnouncerProvider>
      </body>
    </html>
  );
}
