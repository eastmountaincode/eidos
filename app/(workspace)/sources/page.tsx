import { SourcesLibrary } from "@/components/v2/SourcesLibrary";
import { getSources } from "@/lib/eidos-api";

export default async function SourcesPage() {
  const { entries } = await getSources();
  return <SourcesLibrary entries={entries} />;
}
