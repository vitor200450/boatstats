"use client";

import { useState } from "react";

export default function AdminImportEventPage() {
  const [eventId, setEventId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setLogs([]);
    addLog(`INIT: Connecting to Frosthex API...`);

    // Simulated Import Process matching the visual
    setTimeout(() => addLog(`[HTTP 200] Fetched data for ${eventId}`), 800);
    setTimeout(() => addLog(`START: Parsing ${eventId}.json...`), 1200);
    setTimeout(() => addLog(`[INFO] Found 52 drivers in event payload.`), 1500);
    setTimeout(() => addLog(`UPSERT: Synchronizing players table...`), 2000);
    setTimeout(
      () => addLog(`[INFO] Skipped 48 existing, inserted 4 new drivers.`),
      2600,
    );
    setTimeout(
      () => addLog(`CALC: Applying League Points System (ID: ckx129...).`),
      3000,
    );
    setTimeout(
      () => addLog(`[SUCCESS] Race imported. Event state set to IMPORTED.`),
      4000,
    );
    setTimeout(() => {
      addLog(`DONE. Redirecting or awaiting new input...`);
      setIsSubmitting(false);
    }, 4500);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950 relative max-w-3xl mx-auto py-10 animate-in fade-in duration-500">
      <header className="mb-8">
        <h1 className="text-xl font-bold text-white tracking-tight font-mono flex items-center gap-2">
          <span className="text-cyan-500">/</span> IMPORT_EVENT
        </h1>
      </header>

      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-sm shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-cyan-900/10 to-transparent pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-zinc-600"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-zinc-600"></div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white font-mono mb-2">
            Import Race Event
          </h2>
          <p className="text-zinc-400 text-sm">
            Synchronize external race data from the official API directly into
            the league database. Ensure the event ID is valid before proceeding.
          </p>
        </div>

        <form onSubmit={handleImport} className="space-y-6">
          <div className="space-y-2">
            <label
              className="block text-xs uppercase tracking-wider font-bold text-zinc-500 font-mono"
              htmlFor="event-id"
            >
              Event Identifier
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-zinc-500 group-focus-within:text-cyan-500 transition-colors">
                web
              </span>
              <input
                id="event-id"
                autoComplete="off"
                type="text"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                placeholder="Enter API Event ID (e.g., W4FC-26-R5-Monaco)..."
                className="w-full bg-zinc-950 border border-zinc-700 text-white pl-12 pr-4 py-4 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 focus:outline-none placeholder-zinc-600 font-mono text-lg transition-all"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 px-6 text-lg tracking-wide uppercase transition-all duration-200 shadow-lg shadow-cyan-900/20 hover:shadow-cyan-500/20 flex items-center justify-center gap-2 group/btn disabled:opacity-50"
            >
              <span
                className={`material-symbols-outlined ${isSubmitting ? "animate-spin" : ""}`}
              >
                sync
              </span>
              {isSubmitting ? "Syncing..." : "Sync Event Data"}
            </button>
          </div>
        </form>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-zinc-500 uppercase">
              System Output
            </span>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
              <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
              <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
            </div>
          </div>
          <div className="bg-black border border-zinc-800 p-4 font-mono text-xs h-48 overflow-y-auto shadow-inner rounded-md flex flex-col space-y-1">
            {logs.length === 0 ? (
              <div className="text-zinc-600 italic">Waiting for input...</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="text-zinc-400 flex gap-2">
                  <span className="text-zinc-600 select-none">&gt;</span>
                  <span
                    className={
                      log.includes("SUCCESS") || log.includes("[HTTP 200]")
                        ? "text-green-400"
                        : log.includes("ERROR")
                          ? "text-red-400"
                          : ""
                    }
                  >
                    {log}
                  </span>
                </div>
              ))
            )}
            {isSubmitting && (
              <div className="text-cyan-500 flex gap-2 animate-pulse mt-2">
                <span className="text-zinc-600 select-none">&gt;</span>_
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
