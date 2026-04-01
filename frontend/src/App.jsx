import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  MessageSquare,
  BarChart3,
  Settings,
  Search,
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  Loader2,
  Zap,
  Shield,
  Layers,
  ArrowRight,
  Database,
  Cpu,
  TrendingUp,
  Target,
  Globe,
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8080').replace(/\/$/, '');

const MODEL_OPTIONS = [
  {
    id: 'semantic-search',
    label: 'Semantic Search',
    helper: 'Returns the top matching chunks from your indexed documents.',
  },
  {
    id: 'contextual-rag',
    label: 'Contextual RAG',
    helper: 'Builds a grounded answer from the strongest retrieved context.',
  },
];

const LANDING_FEATURES = [
  {
    icon: Target,
    title: 'Decision Velocity',
    body: 'Reduce time-to-insight from hours to seconds with retrieval across your document corpus.',
    accent: 'from-amber-400/20 to-amber-500/5 text-amber-200',
  },
  {
    icon: Shield,
    title: 'Operational Confidence',
    body: 'Surface clauses, specs, and reference pages before they become blockers or blind spots.',
    accent: 'from-emerald-400/20 to-emerald-500/5 text-emerald-200',
  },
  {
    icon: Globe,
    title: 'Institutional Memory',
    body: 'Turn isolated PDFs into a shared knowledge layer your team can query and trust.',
    accent: 'from-sky-400/20 to-sky-500/5 text-sky-200',
  },
];

const LANDING_CAPABILITIES = [
  'Fast ingestion through the Go gateway',
  'PDF extraction and embedding in Python',
  'pgvector-backed semantic retrieval',
  'Grounded RAG-style answers with citations',
];

const ACCURACY_TO_SIMILARITY = {
  low: 0.25,
  medium: 0.4,
  high: 0.6,
  'very-high': 0.8,
};

function formatBytes(sizeBytes, fallback = 'n/a') {
  if (typeof sizeBytes !== 'number') {
    return fallback;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }) {
  const styles = {
    queued: 'bg-sky-50 text-sky-700 border-sky-100',
    processed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    processing: 'bg-amber-50 text-amber-700 border-amber-100',
    failed: 'bg-rose-50 text-rose-700 border-rose-100',
  };
  const icons = {
    queued: <Clock size={14} />,
    processed: <CheckCircle2 size={14} />,
    processing: <Clock size={14} className="animate-spin" />,
    failed: <AlertCircle size={14} />,
  };

  const safeStatus = styles[status] ? status : 'queued';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] ${styles[safeStatus]}`}
    >
      {icons[safeStatus]}
      {safeStatus}
    </span>
  );
}

function App() {
  const [view, setView] = useState('landing');
  const [activeTab, setActiveTab] = useState('documents');
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'assistant',
      content:
        'Welcome to Shizune. Upload documents, then ask questions to explore indexed chunks or get a grounded answer.',
    },
  ]);
  const [accuracyLevel, setAccuracyLevel] = useState('medium');
  const [selectedModel, setSelectedModel] = useState('semantic-search');
  const chatEndRef = useRef(null);

  const activeModel = MODEL_OPTIONS.find((option) => option.id === selectedModel) || MODEL_OPTIONS[0];
  const processedCount = documents.filter((doc) => doc.status === 'processed').length;
  const processingCount = documents.filter((doc) => doc.status === 'processing' || doc.status === 'queued').length;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isTyping]);

  useEffect(() => {
    let intervalId;

    const fetchDocuments = async () => {
      try {
        const res = await fetch(`${API_BASE}/documents`);
        if (!res.ok) {
          return;
        }

        const data = await res.json();
        if (Array.isArray(data)) {
          setDocuments(data);
        }
      } catch (error) {
        // Keep the current state when the backend is unavailable.
      }
    };

    fetchDocuments();
    intervalId = window.setInterval(fetchDocuments, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const optimisticDocument = {
      id: Date.now(),
      filename: file.name,
      status: 'processing',
      size: formatBytes(file.size),
      date: new Date().toISOString().split('T')[0],
    };

    setDocuments((prev) => [optimisticDocument, ...prev]);
    setView('app');
    setActiveTab('documents');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const refreshed = await fetch(`${API_BASE}/documents`);
      if (refreshed.ok) {
        const payload = await refreshed.json();
        if (Array.isArray(payload)) {
          setDocuments(payload);
        }
      }
    } catch (error) {
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === optimisticDocument.id ? { ...doc, status: 'failed' } : doc)),
      );
    } finally {
      event.target.value = '';
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }

    const userQuery = query;
    setChatHistory((prev) => [...prev, { role: 'user', content: userQuery }]);
    setQuery('');
    setIsTyping(true);
    setView('app');
    setActiveTab('chat');

    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userQuery,
          model: selectedModel,
          min_similarity: ACCURACY_TO_SIMILARITY[accuracyLevel],
        }),
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const payload = await response.json();
      const results = Array.isArray(payload.results) ? payload.results.slice(0, 5) : [];

      const assistantMessage =
        selectedModel === 'contextual-rag'
          ? {
              role: 'assistant',
              type: 'contextual-rag',
              content:
                payload.answer || 'No grounded answer could be generated from the retrieved document context.',
              results,
            }
          : results.length > 0
            ? {
                role: 'assistant',
                type: 'search',
                results,
              }
            : {
                role: 'assistant',
                content: 'No relevant results were found for that question.',
              };

      setChatHistory((prev) => [...prev, assistantMessage]);
    } catch (error) {
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Search failed. Verify the backend is running and try again.',
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  if (view === 'landing') {
    return (
      <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_28%),linear-gradient(180deg,#08111f_0%,#050912_42%,#04070d_100%)] text-slate-100">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-600 shadow-[0_18px_60px_rgba(14,165,233,0.25)]">
              <Cpu size={22} className="text-white" />
            </div>
            <div>
              <p className="text-lg font-black uppercase tracking-[0.28em] text-white">Shizune</p>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Intelligent Document Analyzer</p>
            </div>
          </div>

          <div className="hidden items-center gap-8 text-sm font-semibold text-slate-300 md:flex">
            <a href="#opportunity" className="transition-colors hover:text-white">
              Opportunity
            </a>
            <a href="#features" className="transition-colors hover:text-white">
              Features
            </a>
            <button
              onClick={() => setView('app')}
              className="rounded-full border border-sky-400/30 bg-white px-6 py-2.5 text-slate-950 transition-all hover:bg-sky-50"
            >
              Open Workspace
            </button>
          </div>
        </nav>

        <header className="mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pt-20">
          <div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-sky-300">
              <TrendingUp size={14} />
              Turn static files into a searchable knowledge layer
            </div>

            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Search less.
              <span className="block bg-gradient-to-r from-sky-300 via-white to-cyan-300 bg-clip-text text-transparent">
                Understand more.
              </span>
            </h1>

            <p className="mt-8 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
              Shizune turns uploaded documents into indexed, conversational knowledge. Your team can ingest files,
              retrieve relevant chunks, and generate grounded answers through one lean Go, Python, and pgvector stack.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <button
                onClick={() => setView('app')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-500 px-8 py-4 text-base font-bold text-slate-950 shadow-[0_18px_60px_rgba(14,165,233,0.3)] transition-all hover:bg-sky-400"
              >
                Launch Workspace
                <ArrowRight size={18} />
              </button>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-8 py-4 text-base font-bold text-white transition-all hover:border-slate-500 hover:bg-slate-900"
              >
                Explore Capabilities
                <Layers size={18} />
              </a>
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Pipeline</p>
                <p className="mt-3 text-3xl font-black text-white">Go + Python</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Retrieval</p>
                <p className="mt-3 text-3xl font-black text-white">pgvector</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Experience</p>
                <p className="mt-3 text-3xl font-black text-white">Search + RAG</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_30px_120px_rgba(15,23,42,0.55)] backdrop-blur-xl">
            <div className="flex items-center gap-2 pb-5">
              <div className="h-3 w-3 rounded-full bg-rose-400" />
              <div className="h-3 w-3 rounded-full bg-amber-400" />
              <div className="h-3 w-3 rounded-full bg-emerald-400" />
              <span className="ml-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                Live Retrieval Snapshot
              </span>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-sky-400/10 bg-slate-950/70 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Database size={18} className="text-sky-300" />
                    <span className="text-sm font-semibold text-slate-200">Indexed Chunks</span>
                  </div>
                  <span className="text-sm font-black text-sky-300">Vector Ready</span>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-400">
                  Upload once, then query across your processed pages with semantic retrieval and grounded context.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Embedding Model</p>
                  <p className="mt-3 text-lg font-bold text-white">MiniLM-L6-v2</p>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">API Surface</p>
                  <p className="mt-3 text-lg font-bold text-white">Upload, Search, Jobs</p>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-5 text-sm text-emerald-200">
                Grounded answers are assembled from retrieved document snippets rather than free-form generation.
              </div>
            </div>
          </div>
        </header>

        <section id="opportunity" className="border-y border-white/5 bg-white/[0.02] px-6 py-24 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.34em] text-sky-300">The Opportunity</p>
              <h2 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
                Static documents are slowing down operational decisions.
              </h2>
              <p className="mt-6 text-lg leading-8 text-slate-400">
                This project gives teams a lightweight retrieval interface for dense PDFs, reports, and contracts
                without needing a heavyweight enterprise platform.
              </p>
            </div>

            <div className="mt-16 grid gap-6 lg:grid-cols-3">
              {LANDING_FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-8 shadow-[0_20px_80px_rgba(2,6,23,0.35)]"
                >
                  <div
                    className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.accent}`}
                  >
                    <feature.icon size={24} />
                  </div>
                  <h3 className="mt-6 text-2xl font-black text-white">{feature.title}</h3>
                  <p className="mt-4 text-base leading-7 text-slate-400">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto grid max-w-7xl gap-14 px-6 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.34em] text-sky-300">Platform Focus</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Built for practical retrieval, not dashboard theater.
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-400">
              The frontend stays tightly connected to the actual Go and Python services, so the landing page leads
              directly into the same working workspace used for upload and search.
            </p>

            <div className="mt-10 space-y-4">
              {LANDING_CAPABILITIES.map((capability) => (
                <div
                  key={capability}
                  className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-4"
                >
                  <CheckCircle2 size={18} className="shrink-0 text-sky-300" />
                  <span className="font-medium text-slate-200">{capability}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                <Zap size={22} className="text-amber-300" />
                <h3 className="mt-4 text-xl font-black text-white">Fast Start</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Lighter embedding defaults keep the deployment small enough for constrained hosting.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                <Layers size={22} className="text-cyan-300" />
                <h3 className="mt-4 text-xl font-black text-white">Clear Boundaries</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Upload, search, and job status remain separated cleanly across the stack.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                <Database size={22} className="text-emerald-300" />
                <h3 className="mt-4 text-xl font-black text-white">Retrieval First</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Results are backed by document chunks and similarity scores stored in PostgreSQL with pgvector.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
                <MessageSquare size={22} className="text-fuchsia-300" />
                <h3 className="mt-4 text-xl font-black text-white">Answer Layer</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Contextual mode assembles a grounded response from retrieved snippets instead of inventing one.
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/5 px-6 py-14 text-center sm:px-8">
          <div className="flex items-center justify-center gap-3">
            <Cpu size={16} className="text-sky-300" />
            <span className="text-sm font-black uppercase tracking-[0.28em] text-slate-300">Shizune</span>
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-500">
            A focused document intelligence frontend for upload, retrieval, and grounded search across your indexed
            corpus.
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 lg:h-screen lg:flex-row">
      <aside className="w-full border-b border-slate-800 bg-slate-950 text-slate-300 lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between p-6">
          <button className="group flex items-center gap-3 text-left" onClick={() => setView('landing')}>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-600 shadow-[0_18px_50px_rgba(14,165,233,0.2)] transition-transform group-hover:scale-105">
              <Cpu size={20} className="text-white" />
            </div>
            <div>
              <p className="text-lg font-black uppercase tracking-[0.22em] text-white">Shizune</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Workspace</p>
            </div>
          </button>
        </div>

        <nav className="grid gap-1 px-4 pb-4 lg:block lg:space-y-1 lg:pb-0">
          {[
            { id: 'documents', icon: FileText, label: 'Library' },
            { id: 'chat', icon: MessageSquare, label: 'RAG Console' },
            { id: 'analytics', icon: BarChart3, label: 'Insights' },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all ${
                activeTab === item.id
                  ? 'bg-sky-500 text-slate-950 shadow-[0_18px_50px_rgba(14,165,233,0.2)]'
                  : 'hover:bg-slate-900 hover:text-white'
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4 lg:mt-auto">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Environment</p>
            <p className="mt-3 text-sm font-semibold text-white">
              {import.meta.env.PROD ? 'Production Render Frontend' : 'Local Development Frontend'}
            </p>
            <button
              onClick={() => setView('landing')}
              className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-sky-300 transition-colors hover:text-sky-200"
            >
              Return To Landing
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-slate-200 bg-white/85 px-6 py-4 backdrop-blur sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-xl">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search across indexed documents..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-100 py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              />
            </div>

            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-sky-500 hover:text-slate-950">
              <Upload size={16} />
              Ingest Assets
              <input type="file" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">
          {activeTab === 'documents' && (
            <div className="mx-auto max-w-6xl">
              <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-3xl font-black tracking-tight text-slate-950">Active Knowledge Base</h2>
                  <p className="mt-2 text-slate-500">
                    Monitor uploads and processing state across the Go gateway and Python ingestion service.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Documents</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{documents.length}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Processed</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{processedCount}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">In Flight</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{processingCount}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-6 py-5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                          Document Name
                        </th>
                        <th className="px-6 py-5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                          Processing State
                        </th>
                        <th className="px-6 py-5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                          Size
                        </th>
                        <th className="px-6 py-5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                          Date
                        </th>
                        <th className="px-6 py-5 text-right text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {documents.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-sm text-slate-500">
                            No documents uploaded yet. Add a file to start indexing your knowledge base.
                          </td>
                        </tr>
                      )}

                      {documents.map((doc) => (
                        <tr key={doc.id} className="transition-colors hover:bg-slate-50">
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-4 font-semibold text-slate-800">
                              <div className="rounded-2xl bg-sky-50 p-3 text-sky-600">
                                <FileText size={18} />
                              </div>
                              <span className="break-all">{doc.filename}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <StatusBadge status={doc.status} />
                          </td>
                          <td className="px-6 py-5 text-sm font-medium text-slate-500">
                            {formatBytes(doc.sizeBytes, doc.size || 'n/a')}
                          </td>
                          <td className="px-6 py-5 text-sm font-medium text-slate-500">{doc.date || 'n/a'}</td>
                          <td className="px-6 py-5 text-right">
                            <button className="rounded-xl p-2 text-slate-300 transition-colors hover:text-slate-600">
                              <MoreVertical size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="mx-auto flex h-full max-w-5xl flex-col">
              <div className="mb-6">
                <h2 className="text-3xl font-black tracking-tight text-slate-950">RAG Query Console</h2>
                <p className="mt-2 text-slate-500">
                  Query indexed documents using semantic search or a grounded contextual answer mode.
                </p>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <label htmlFor="model-select" className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                        Mode
                      </label>
                      <select
                        id="model-select"
                        value={selectedModel}
                        onChange={(event) => setSelectedModel(event.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                      >
                        {MODEL_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-3">
                      <label
                        htmlFor="accuracy-select"
                        className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500"
                      >
                        Accuracy
                      </label>
                      <select
                        id="accuracy-select"
                        value={accuracyLevel}
                        onChange={(event) => setAccuracyLevel(event.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-300"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="very-high">Very High</option>
                      </select>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">{activeModel.helper}</p>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                  {chatHistory.map((message, index) => (
                    <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[90%] rounded-[1.75rem] px-5 py-4 ${
                          message.role === 'user'
                            ? 'rounded-tr-md bg-slate-950 text-white'
                            : 'rounded-tl-md border border-sky-100 bg-sky-50/60 text-slate-800'
                        }`}
                      >
                        {message.type === 'search' ? (
                          <div className="space-y-3">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Top Matches</p>
                            {message.results.map((item, resultIndex) => {
                              const page = item?.metadata?.page ? `p.${item.metadata.page}` : 'p.?';
                              const source = item?.metadata?.source || 'unknown source';
                              const score =
                                typeof item?.similarity === 'number'
                                  ? `${(item.similarity * 100).toFixed(1)}%`
                                  : 'n/a';
                              return (
                                <div key={resultIndex} className="rounded-2xl border border-slate-200 bg-white p-4">
                                  <p className="mb-2 text-xs font-medium text-slate-500">
                                    {source} • {page} • score {score}
                                  </p>
                                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                                    {item.content}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        ) : message.type === 'contextual-rag' ? (
                          <div className="space-y-4">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                                Grounded Answer
                              </p>
                              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                            </div>
                            {message.results?.length > 0 && (
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                                  Retrieved Context
                                </p>
                                <div className="space-y-3">
                                  {message.results.map((item, resultIndex) => {
                                    const page = item?.metadata?.page ? `p.${item.metadata.page}` : 'p.?';
                                    const source = item?.metadata?.source || 'unknown source';
                                    const score =
                                      typeof item?.similarity === 'number'
                                        ? `${(item.similarity * 100).toFixed(1)}%`
                                        : 'n/a';
                                    return (
                                      <div
                                        key={resultIndex}
                                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                      >
                                        <p className="mb-2 text-xs font-medium text-slate-500">
                                          {source} • {page} • score {score}
                                        </p>
                                        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                                          {item.content}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <Loader2 size={16} className="animate-spin text-sky-500" />
                        <span className="text-xs font-bold uppercase tracking-[0.18em] text-sky-500">
                          {selectedModel === 'contextual-rag' ? 'Grounding Answer' : 'Searching Vectors'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="border-t border-slate-100 bg-slate-50/80 p-6">
                  <div className="relative flex items-center gap-3">
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={
                        selectedModel === 'contextual-rag'
                          ? 'Ask a question for a grounded answer...'
                          : 'Ask a semantic search question...'
                      }
                      className="w-full rounded-[1.4rem] border border-slate-200 bg-white py-4 pl-5 pr-14 text-sm font-medium outline-none transition-all focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                    />
                    <button
                      type="submit"
                      disabled={!query.trim() || isTyping}
                      className="absolute right-3 rounded-xl bg-sky-500 p-2.5 text-slate-950 transition-all hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="mx-auto max-w-6xl">
              <h2 className="text-3xl font-black tracking-tight text-slate-950">System Insights</h2>
              <p className="mt-2 text-slate-500">
                Lightweight deployment telemetry for the lean Render profile.
              </p>

              <div className="mt-8 grid gap-6 md:grid-cols-3">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Indexed Documents</p>
                  <p className="mt-4 text-4xl font-black text-slate-950">{documents.length}</p>
                  <p className="mt-3 text-sm text-slate-500">Documents currently tracked by the Go gateway.</p>
                </div>
                <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Embedding Profile</p>
                  <p className="mt-4 text-4xl font-black text-slate-950">MiniLM</p>
                  <p className="mt-3 text-sm text-slate-500">Lightweight model choice for constrained hosting.</p>
                </div>
                <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Retrieval Stack</p>
                  <p className="mt-4 text-4xl font-black text-slate-950">Live</p>
                  <p className="mt-3 text-sm text-slate-500">Go gateway, Python ML service, and pgvector database.</p>
                </div>
              </div>

              <div className="mt-8 rounded-[2rem] border-2 border-dashed border-slate-200 bg-white p-12 text-center">
                <BarChart3 size={56} className="mx-auto text-slate-200" />
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Intentional Scope</p>
                <p className="mt-3 text-base text-slate-500">
                  Analytics are intentionally minimal here so the deployed product stays focused on ingestion and
                  retrieval.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="mx-auto max-w-4xl">
              <h2 className="text-3xl font-black tracking-tight text-slate-950">Deployment Settings</h2>
              <p className="mt-2 text-slate-500">
                Core environment assumptions exposed in the frontend for clarity during deployment.
              </p>

              <div className="mt-8 grid gap-6">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">API Base</p>
                  <p className="mt-4 break-all font-mono text-sm text-slate-700">{API_BASE}</p>
                </div>
                <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Search Modes</p>
                  <div className="mt-4 grid gap-3">
                    {MODEL_OPTIONS.map((option) => (
                      <div key={option.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <p className="font-semibold text-slate-900">{option.label}</p>
                        <p className="mt-1 text-sm text-slate-500">{option.helper}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
