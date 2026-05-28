import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { ingestFile } from '../lib/ingest';
import type { SourceType } from '../lib/types';

interface Props { userId: string }

const SOURCE_INFO = {
  sap: {
    label: 'SAP — Fuel & Procurement',
    description: 'MM60 flat-file export (tab or semicolon separated). Handles German/English column headers, inconsistent units (L, GAL, M3, KG), and DD.MM.YYYY dates.',
    scope: 'Scope 1 (fuel) · Scope 3 (procurement)',
    color: 'orange',
    sample: `Plant,Cost Center,Material Number,Material Description,Vendor,Quantity,Unit,Posting Date\nPLANT_DE01,CC-4100,MAT-DIESEL-01,Diesel Kraftstoff,Shell GmbH,1200,L,2024-01-15\nPLANT_DE01,CC-4100,MAT-PETROL-02,Benzin bleifrei,BP AG,800,L,2024-01-22\nPLANT_US03,CC-5000,MAT-DIESEL-01,Diesel Fuel,Petro Corp,2500,GAL,2024-01-28\nPLANT_DE01,CC-3200,MAT-LPG-01,Autogas LPG,Progas,450,KG,2024-02-05`,
  },
  utility: {
    label: 'Utility — Electricity',
    description: 'Portal CSV export (PG&E, National Grid, Ameren style). Billing periods may span partial months. Supports kWh and MWh columns.',
    scope: 'Scope 2 (market-based)',
    color: 'sky',
    sample: `Account Number,Service Address,Billing Period Start,Billing Period End,kWh Used,Rate Schedule\nACCT-001,123 Main St Chicago IL,2024-01-15,2024-02-14,48200,General Service Large\nACCT-002,456 Oak Ave Chicago IL,2024-01-18,2024-02-17,12750,Commercial Tariff C1\nACCT-003,789 Industrial Blvd,2024-01-10,2024-02-09,98400,Industrial TOU\nACCT-001,123 Main St Chicago IL,2024-02-15,2024-03-14,51000,General Service Large`,
  },
  travel: {
    label: 'Corporate Travel — Flights / Hotels / Ground',
    description: 'Concur or Navan CSV trip export. Flight distances estimated from IATA codes when not provided. DEFRA 2023 emission factors applied by category.',
    scope: 'Scope 3 (business travel)',
    color: 'teal',
    sample: `Employee ID,Expense Type,Origin,Destination,Distance (km),Cabin Class,Nights,Date\nEMP-001,Air Travel,JFK,LHR,,Economy,,2024-02-05\nEMP-002,Air Travel,ORD,SFO,2962,Economy,,2024-02-07\nEMP-001,Hotel,,,,3,2024-02-06\nEMP-003,Air Travel,LAX,NRT,,Business,,2024-02-10\nEMP-002,Taxi/Rideshare,,,45,,,2024-02-07`,
  },
} as const;

function downloadSample(sourceType: SourceType) {
  const info = SOURCE_INFO[sourceType];
  const blob = new Blob([info.sample], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sample_${sourceType}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export default function IngestPage({ userId }: Props) {
  const [sourceType, setSourceType] = useState<SourceType>('sap');
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ parsed: number; failed: number; errors: { row: number; message: string }[] } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandErrors, setExpandErrors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const info = SOURCE_INFO[sourceType];
  const colorMap: Record<string, string> = {
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    sky: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    teal: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  };
  const badgeClass = colorMap[info.color];

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setState('uploading');
    setProgress(0);
    setResult(null);
    setErrorMessage(null);
    try {
      const res = await ingestFile(file, sourceType, userId, setProgress);
      setResult(res);
      setState('done');
    } catch (err) {
      console.error(err);
      setErrorMessage((err as Error)?.message ?? String(err));
      setState('error');
    }
  }

  function reset() {
    setFile(null);
    setState('idle');
    setResult(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-white text-2xl font-bold">Ingest Data</h1>
        <p className="text-slate-400 text-sm mt-1">Upload source files for normalization and analyst review.</p>
      </div>

      {/* Source type selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">1. Select Source Type</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.keys(SOURCE_INFO) as SourceType[]).map(key => {
            const s = SOURCE_INFO[key];
            const active = sourceType === key;
            return (
              <button
                key={key}
                onClick={() => setSourceType(key)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  active
                    ? `border-${s.color}-500/60 bg-${s.color}-500/10`
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                <div className={`text-sm font-semibold mb-1 ${active ? `text-${s.color}-400` : 'text-slate-300'}`}>
                  {s.label}
                </div>
                <div className="text-slate-500 text-xs leading-relaxed">{s.scope}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-4 p-3.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
          <p className="text-slate-400 text-xs leading-relaxed">{info.description}</p>
          <button
            onClick={() => downloadSample(sourceType)}
            className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download sample {sourceType}.csv
          </button>
        </div>
      </div>

      {/* File upload */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">2. Upload File</h2>

        {state === 'idle' || state === 'error' ? (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors group"
            >
              <Upload className="w-8 h-8 text-slate-600 group-hover:text-emerald-500/70 mx-auto mb-3 transition-colors" />
              <p className="text-slate-300 text-sm font-medium">
                {file ? file.name : 'Drop CSV file here or click to browse'}
              </p>
              <p className="text-slate-500 text-xs mt-1">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : '.csv, .txt, .tsv accepted'}
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {state === 'error' && (
              <div className="flex items-center gap-2 mt-3 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <div>
                  <div>Upload failed. Check the console for details.</div>
                  {errorMessage && <div className="text-xs text-red-300 mt-1 break-all">{errorMessage}</div>}
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleUpload}
                disabled={!file}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
              >
                Ingest File
              </button>
              {file && (
                <button onClick={reset} className="px-4 text-slate-400 hover:text-slate-200 text-sm transition-colors">
                  Clear
                </button>
              )}
            </div>
          </>
        ) : state === 'uploading' ? (
          <div className="py-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-400">Parsing and ingesting...</span>
              <span className="text-emerald-400 font-medium">{progress}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-slate-500 text-xs mt-2 text-center">{file?.name}</p>
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-emerald-400 font-bold text-xl">{result.parsed}</div>
                  <div className="text-slate-400 text-xs">records ingested</div>
                </div>
              </div>
              <div className={`flex items-center gap-3 rounded-xl p-4 border ${
                result.failed > 0
                  ? 'bg-red-500/10 border-red-500/20'
                  : 'bg-slate-800/60 border-slate-700'
              }`}>
                {result.failed > 0
                  ? <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  : <CheckCircle className="w-5 h-5 text-slate-500 flex-shrink-0" />}
                <div>
                  <div className={`font-bold text-xl ${result.failed > 0 ? 'text-red-400' : 'text-slate-500'}`}>{result.failed}</div>
                  <div className="text-slate-400 text-xs">parse errors</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/40 rounded-lg px-3 py-2.5">
              <FileText className="w-3.5 h-3.5" />
              Records marked as <span className="text-amber-400 font-medium">flagged</span> have data quality issues and require analyst attention before approval.
            </div>

            {result.errors.length > 0 && (
              <div className="border border-red-900/40 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandErrors(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-red-950/30 text-sm"
                >
                  <span className="text-red-400 font-medium">{result.errors.length} parse error(s)</span>
                  {expandErrors ? <ChevronUp className="w-4 h-4 text-red-400" /> : <ChevronDown className="w-4 h-4 text-red-400" />}
                </button>
                {expandErrors && (
                  <div className="divide-y divide-red-900/20 max-h-48 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="px-4 py-2.5 text-xs">
                        <span className="text-slate-500">Row {e.row}:</span>
                        <span className="text-red-400 ml-1">{e.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={reset}
              className="w-full border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
            >
              Upload another file
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
