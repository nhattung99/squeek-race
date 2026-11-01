import { notFound } from "next/navigation";
import { ArenaApp } from "@/components/arena-app";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = slug?.join("/") ?? "";
  if (
    ![
      "",
      "arena",
      "predict",
      "leaderboard",
      "history",
      "how-to-play",
      "about",
    ].includes(page)
  )
    notFound();
  return <ArenaApp page={page} />;
}
