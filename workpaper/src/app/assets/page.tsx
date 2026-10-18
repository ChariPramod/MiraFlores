import { deliver } from "@/lib/security/delivery";
import { AppShell } from "@/components/AppShell";
import { projectAssets } from "@/lib/packet/areas";
import { getWorkpaperSession } from "@/lib/workspace/session";
import { getPersonaLabel } from "@/lib/workspace/staff";

type PageProps = {
  searchParams: Promise<{ version?: string }>;
};

export default async function AssetsPage({ searchParams }: PageProps) {
  const session = await getWorkpaperSession();
  const { version: versionParam } = await searchParams;
  const version = versionParam ?? session.version;
  const assets = await deliver(session, "assets", projectAssets(version));

  return (
    <AppShell
      workspaceId={session.workspaceId}
      personaId={session.personaId}
      personaName={getPersonaLabel(session.personaId)}
      version={version}
      simulationDate={session.simulationDate}
    >
      <header className="mb-6 space-y-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">
          Area workspace · assets
        </p>
        <h1 className="font-serif text-3xl">Depreciable assets</h1>
        <p className="text-sm text-ink-muted">
          {assets.length} assets · federal / California history from engine{" "}
          {version}. California AMT not computed in packet — shown as absent
          where missing.
        </p>
      </header>

      <div className="overflow-auto rounded border border-line bg-panel">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-paper-deep/60 text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2">Cost</th>
              <th className="px-3 py-2">Method / life</th>
              <th className="px-3 py-2">Fed dep. 2025</th>
              <th className="px-3 py-2">Fed accum.</th>
              <th className="px-3 py-2">CA accum.</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.assetId} className="border-b border-line/60">
                <td className="px-3 py-2">
                  <div className="font-mono text-xs">{a.assetId}</div>
                  <div>{a.description}</div>
                  <div className="text-xs text-ink-muted">{a.activity}</div>
                </td>
                <td className="px-3 py-2 font-mono tabular-nums">
                  {a.costDisplay}
                </td>
                <td className="px-3 py-2 text-xs">
                  {a.method} · {a.lifeYears} yrs
                </td>
                <td className="px-3 py-2 font-mono tabular-nums">
                  {a.federalDepreciation2025}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums">
                  {a.federalAccumEnd}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums">
                  {a.caAccumEnd}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
