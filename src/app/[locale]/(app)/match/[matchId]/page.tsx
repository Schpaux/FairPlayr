import { MatchDetailsManager } from "@/components/match/MatchDetailsManager";

export default async function MatchDetailsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  return <MatchDetailsManager matchId={matchId} />;
}
