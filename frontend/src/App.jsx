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
  Info
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

const App = () => {
  const [activeTab, setActiveTab] = useState('documents');
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [accuracyLevel, setAccuracyLevel] = useState('medium');
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isTyping]);

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
    } catch (err) {
      // No-op: keep current list if backend is unavailable.
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newDoc = {
      id: Date.now(),
      filename: file.name,
      status: 'processing',
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      date: new Date().toISOString().split('T')[0]
    };

    setDocuments((prev) => [newDoc, ...prev]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        await fetchDocuments();
      } else {
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.id === newDoc.id
              ? {
                  ...doc,
                  status: 'failed'
                }
              : doc
          )
        );
      }
    } catch (err) {
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === newDoc.id
            ? {
                ...doc,
                status: 'failed'
              }
            : doc
        )
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = { role: 'user', content: query };
    setChatHistory((prev) => [...prev, userMessage]);
    setQuery('');
    setIsTyping(true);

    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          min_similarity:
            accuracyLevel === 'low'
              ? 0.25
              : accuracyLevel === 'medium'
              ? 0.4
              : accuracyLevel === 'high'
              ? 0.6
              : 0.8
        })
      });

      if (!res.ok) {
        throw new Error('Search failed');
      }

      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      const assistantMessage = results.length
        ? {
            role: 'assistant',
            type: 'search',
            results: results.slice(0, 5)
          }
        : {
            role: 'assistant',
            content: 'No relevant results found.'
          };
      setChatHistory((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const assistantMessage = {
        role: 'assistant',
        content: 'Search failed. Please try again after verifying the backend is running.'
      };
      setChatHistory((prev) => [...prev, assistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      processed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      processing: 'bg-amber-100 text-amber-700 border-amber-200',
      failed: 'bg-rose-100 text-rose-700 border-rose-200'
    };
    const icons = {
      processed: <CheckCircle2 size={14} />,
      processing: <Clock size={14} className="animate-spin" />,
      failed: <AlertCircle size={14} />
    };

    return (
      <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <FileText className="text-white" size={18} />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">DocAnalyzer</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {[
            { id: 'documents', icon: FileText, label: 'Library' },
            { id: 'chat', icon: MessageSquare, label: 'RAG Chat' },
            { id: 'analytics', icon: BarChart3, label: 'Analytics' },
            { id: 'settings', icon: Settings, label: 'Settings' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                activeTab === item.id
                  ? 'bg-blue-600/10 text-blue-400 font-medium'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-teal-400" />
            <div className="text-xs">
              <p className="text-white font-medium">Dev Instance</p>
              <p className="text-slate-500">Local Environment</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search across all documents..."
              className="w-full bg-slate-100 border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer shadow-sm">
              <Upload size={16} />
              <span>Upload Document</span>
              <input type="file" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {activeTab === 'documents' && (
            <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Document Library</h2>
                  <p className="text-slate-500 mt-1">Manage your polyglot-processed ingestion pipeline.</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Document Name</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">File Size</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Processed Date</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {documents.length === 0 && (
                      <tr>
                        <td className="px-6 py-6 text-sm text-slate-500" colSpan={5}>
                          No documents uploaded yet. Use the button above to add a file.
                        </td>
                      </tr>
                    )}
                    {documents.map((doc) => {
                      const sizeLabel = doc.sizeBytes
                        ? `${(doc.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                        : doc.size || 'n/a';
                      return (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3 font-medium text-slate-700">
                            <div className="p-2 bg-blue-50 rounded text-blue-600 group-hover:bg-blue-100 transition-colors">
                              <FileText size={18} />
                            </div>
                            {doc.filename}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={doc.status} />
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{sizeLabel}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{doc.date || 'n/a'}</td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-slate-400 hover:text-slate-600 p-1" aria-label="More">
                            <MoreVertical size={18} />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="max-w-4xl mx-auto h-full flex flex-col animate-in fade-in duration-500">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800">Intelligent RAG Assistant</h2>
                <p className="text-slate-500 mt-1">Semantic search query across your processed knowledge base.</p>
              </div>

              <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {chatHistory.length === 0 && (
                    <p className="text-sm text-slate-500">No messages yet. Ask a question to get started.</p>
                  )}
                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl p-4 ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-slate-100 text-slate-800 rounded-tl-none'
                        }`}
                      >
                        {msg.type === 'search' ? (
                          <div className="text-sm leading-relaxed space-y-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Top Matches</p>
                            <div className="space-y-3">
                              {msg.results.map((item, rIdx) => {
                                const page = item?.metadata?.page ? `p.${item.metadata.page}` : 'p.?';
                                const source = item?.metadata?.source || 'unknown source';
                                const score =
                                  typeof item.similarity === 'number'
                                    ? `${(item.similarity * 100).toFixed(1)}%`
                                    : 'n/a';
                                return (
                                  <div key={rIdx} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-800">
                                    <div className="text-xs text-slate-500 mb-1">
                                      {source} • {page} • score {score}
                                    </div>
                                    <div className="text-sm whitespace-pre-wrap">{item.content}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 rounded-2xl rounded-tl-none p-4 flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin text-slate-400" />
                        <span className="text-xs text-slate-500">Consulting vector database...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-slate-50/50">
                  <div className="relative flex items-center gap-2">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ask about revenue, technical architecture, or summary..."
                      className="flex-1 bg-white border border-slate-200 rounded-xl py-3 px-4 pr-12 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!query.trim() || isTyping}
                      className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-400 transition-all"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <label className="font-semibold text-slate-600" htmlFor="accuracy-select">Accuracy</label>
                    <span
                      title="Controls the minimum similarity: Low (0.25), Medium (0.4), High (0.6), Very High (0.8)"
                      className="text-slate-400 hover:text-slate-600 cursor-help"
                    >
                      <Info size={14} />
                    </span>
                    <select
                      id="accuracy-select"
                      value={accuracyLevel}
                      onChange={(e) => setAccuracyLevel(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="very-high">Very High</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-center text-slate-400 mt-2">
                    Powered by Python RAG Core & Go API Gateway
                  </p>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="max-w-6xl mx-auto animate-in zoom-in-95 duration-500">
              <h2 className="text-2xl font-bold text-slate-800 mb-8">Metadata Insights</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: 'Total Docs', value: documents.length.toString(), change: '+0%', badge: 'blue' },
                  { label: 'Avg Ingestion Time', value: 'n/a', change: 'n/a', badge: 'emerald' },
                  { label: 'Vector Queries', value: 'n/a', change: 'n/a', badge: 'amber' }
                ].map((stat, i) => {
                  const badgeClasses = {
                    blue: 'bg-blue-50 text-blue-600',
                    emerald: 'bg-emerald-50 text-emerald-600',
                    amber: 'bg-amber-50 text-amber-600'
                  }[stat.badge];

                  return (
                  <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
                    <div className="flex items-end justify-between mt-2">
                      <h4 className="text-3xl font-bold text-slate-900">{stat.value}</h4>
                      <span className={`text-xs font-bold px-2 py-1 rounded ${badgeClasses}`}>
                        {stat.change}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="mt-8 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm h-64 flex flex-col items-center justify-center text-slate-400">
                <BarChart3 size={48} className="mb-4 opacity-20" />
                <p>Advanced Java Analytics Visualization Engine</p>
                <p className="text-xs mt-1">Connect to http://localhost:8082/analytics to populate</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
