import React, { useState, useRef } from 'react';
import {
  Trash2,
  Clock,
  X,
  Search,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderPlus,
  FolderOpen,
  Star,
  Edit2,
  MoreVertical,
  Download,
  Upload,
  Check,
  CheckSquare,
  Square,
  FileText,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { formatTimestamp } from './ChatSetGroup';

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  folderId?: string | null;
  pinned?: boolean;
  sets: any[]; // Array of ChatSet
}

export interface HistoryFolder {
  id: string;
  name: string;
  color: string;
  collapsed?: boolean;
}

const FOLDER_COLORS = [
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Indigo', hex: '#6366F1' },
];

interface Props {
  sessions: ChatSession[];
  currentSessionId: string;
  folders: HistoryFolder[];
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onBatchDeleteSessions: (sessionIds: string[]) => void;
  onClearHistory: () => void;
  onCreateFolder: (name: string, color: string) => void;
  onUpdateFolder: (folderId: string, name: string, color: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onToggleFolderCollapse: (folderId: string) => void;
  onMoveToFolder: (sessionId: string, folderId: string | null) => void;
  onBatchMoveToFolder: (sessionIds: string[], folderId: string | null) => void;
  onTogglePin: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onExportAll: () => void;
  onImportData: (data: { folders?: HistoryFolder[]; sessions?: ChatSession[]; sets?: any[] }, mode: 'merge' | 'replace') => void;
  config: any;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportSessionAsMarkdown(session: ChatSession, config: any): string {
  const dateStr = new Date(session.timestamp).toLocaleString('bn-BD');
  let md = `# কথোপকথন: ${session.title}\n\n`;
  md += `> **তারিখ ও সময়:** ${dateStr}\n\n---\n\n`;

  if (Array.isArray(session.sets)) {
    session.sets.forEach((item, idx) => {
      md += `## প্রশ্ন ${idx + 1}: ${item.prompt}\n\n`;
      const provs: ('chatgpt' | 'claude' | 'gemini')[] = ['chatgpt', 'claude', 'gemini'];
      for (const p of provs) {
        const res = item.results?.[p];
        if (res && res.content) {
          const name =
            config?.[p]?.displayName || (p === 'chatgpt' ? 'ChatGPT' : p === 'claude' ? 'Claude' : 'Gemini');
          md += `### ${name}\n\n${res.content}\n\n`;
          if (res.reasoning) {
            md += `<details><summary>চিন্তাভাবনা (Reasoning)</summary>\n\n${res.reasoning}\n\n</details>\n\n`;
          }
        }
      }
      if (item.combinedResult?.content) {
        md += `### সম্মিলিত সেরা উত্তর\n\n${item.combinedResult.content}\n\n`;
      }
      md += `---\n\n`;
    });
  }

  return md;
}

export function exportSessionAsText(session: ChatSession, config: any): string {
  const dateStr = new Date(session.timestamp).toLocaleString('bn-BD');
  let txt = `কথোপকথন: ${session.title}\nতারিখ: ${dateStr}\n`;
  txt += `=========================================\n\n`;

  if (Array.isArray(session.sets)) {
    session.sets.forEach((item, idx) => {
      txt += `[প্রশ্ন ${idx + 1}]: ${item.prompt}\n\n`;
      const provs: ('chatgpt' | 'claude' | 'gemini')[] = ['chatgpt', 'claude', 'gemini'];
      for (const p of provs) {
        const res = item.results?.[p];
        if (res && res.content) {
          const name =
            config?.[p]?.displayName || (p === 'chatgpt' ? 'ChatGPT' : p === 'claude' ? 'Claude' : 'Gemini');
          txt += `--- ${name} ---\n${res.content}\n\n`;
        }
      }
      if (item.combinedResult?.content) {
        txt += `--- সম্মিলিত সেরা উত্তর ---\n${item.combinedResult.content}\n\n`;
      }
      txt += `-----------------------------------------\n\n`;
    });
  }

  return txt;
}

export default function HistorySidebar({
  sessions,
  currentSessionId,
  folders,
  isOpen,
  onClose,
  onSelectSession,
  onDeleteSession,
  onBatchDeleteSessions,
  onClearHistory,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onToggleFolderCollapse,
  onMoveToFolder,
  onBatchMoveToFolder,
  onTogglePin,
  onRenameSession,
  onExportAll,
  onImportData,
  config,
}: Props) {
  const [filter, setFilter] = useState('');
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Folder creation modal
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0].hex);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

  // Folder delete confirmation modal
  const [folderToDelete, setFolderToDelete] = useState<HistoryFolder | null>(null);

  // Inline rename state
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Mobile/Action dropdown open state
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [activeFolderPickerSessionId, setActiveFolderPickerSessionId] = useState<string | null>(null);

  // Batch move folder picker
  const [isBatchMovePickerOpen, setIsBatchMovePickerOpen] = useState(false);

  // Drag over folder ID tracking
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Import modal
  const [importPendingData, setImportPendingData] = useState<{
    folders?: HistoryFolder[];
    sessions?: ChatSession[];
    sets?: any[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Search filter across sessions (title, prompt, answers)
  const query = filter.trim().toLowerCase();
  const filteredSessions = sessions.filter((session) => {
    if (!query) return true;
    const titleMatch = (session.title || '').toLowerCase().includes(query);
    if (titleMatch) return true;

    if (Array.isArray(session.sets)) {
      for (const set of session.sets) {
        if ((set.prompt || '').toLowerCase().includes(query)) return true;
        if ((set.results?.chatgpt?.content || '').toLowerCase().includes(query)) return true;
        if ((set.results?.claude?.content || '').toLowerCase().includes(query)) return true;
        if ((set.results?.gemini?.content || '').toLowerCase().includes(query)) return true;
        if ((set.combinedResult?.content || '').toLowerCase().includes(query)) return true;
      }
    }
    return false;
  });

  const pinnedSessions = filteredSessions.filter((s) => s.pinned);

  const folderSessionsMap: Record<string, ChatSession[]> = {};
  folders.forEach((f) => {
    folderSessionsMap[f.id] = filteredSessions.filter((s) => !s.pinned && s.folderId === f.id);
  });

  const recentSessions = filteredSessions.filter((s) => !s.pinned && !s.folderId);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredSessions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSessions.map((s) => s.id));
    }
  };

  const handleSaveFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = folderName.trim();
    if (!name) return;

    if (editingFolderId) {
      onUpdateFolder(editingFolderId, name, folderColor);
    } else {
      onCreateFolder(name, folderColor);
    }

    setIsFolderModalOpen(false);
    setFolderName('');
    setEditingFolderId(null);
  };

  const openCreateFolder = () => {
    setEditingFolderId(null);
    setFolderName('');
    setFolderColor(FOLDER_COLORS[0].hex);
    setIsFolderModalOpen(true);
  };

  const openEditFolder = (f: HistoryFolder) => {
    setEditingFolderId(f.id);
    setFolderName(f.name);
    setFolderColor(f.color);
    setIsFolderModalOpen(true);
  };

  const startRename = (session: ChatSession) => {
    setRenamingSessionId(session.id);
    setRenameValue(session.title);
    setActiveMenuSessionId(null);
  };

  const saveRename = (sessionId: string) => {
    if (renameValue.trim()) {
      onRenameSession(sessionId, renameValue.trim());
    }
    setRenamingSessionId(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && (Array.isArray(json.sessions) || Array.isArray(json.folders) || Array.isArray(json.sets))) {
          setImportPendingData(json);
        } else if (Array.isArray(json)) {
          setImportPendingData({ sets: json });
        } else {
          alert('অকার্যকর ফাইল ফরম্যাট। অনুগ্রহ করে সঠিক JSON ফাইল দিন।');
        }
      } catch {
        alert('ফাইলটি পড়তে ব্যর্থ হয়েছে।');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDragStart = (e: React.DragEvent, sessionId: string) => {
    e.dataTransfer.setData('text/plain', sessionId);
  };

  const handleDragOver = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(targetFolderId);
  };

  const handleDragLeave = () => {
    setDragOverFolderId(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    const droppedSessionId = e.dataTransfer.getData('text/plain');
    if (droppedSessionId) {
      onMoveToFolder(droppedSessionId, targetFolderId);
    }
    setDragOverFolderId(null);
  };

  // Render session item row in sidebar (Requirement 3: first question or custom title is title, click loads session, delete button 🗑)
  const renderSessionRow = (session: ChatSession) => {
    const isSelected = selectedIds.includes(session.id);
    const isActive = session.id === currentSessionId;
    const title = session.title || 'নতুন কথোপকথন';
    const truncatedTitle = title.length > 38 ? title.slice(0, 38) + '...' : title;

    return (
      <div
        key={session.id}
        draggable={!renamingSessionId}
        onDragStart={(e) => handleDragStart(e, session.id)}
        className={`group relative flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer border ${
          isActive
            ? 'bg-blue-100/70 dark:bg-blue-950/70 border-blue-400 dark:border-blue-700 font-semibold'
            : isSelected
            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
            : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/70 text-zinc-800 dark:text-zinc-200'
        }`}
        onClick={() => {
          if (isMultiSelectMode) {
            handleToggleSelect(session.id);
          } else {
            onSelectSession(session.id);
            if (window.innerWidth < 768) {
              onClose();
            }
          }
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
          {isMultiSelectMode ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSelect(session.id);
              }}
              className="text-blue-600 dark:text-blue-400 p-0.5"
            >
              {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(session.id);
              }}
              className={`p-0.5 rounded-sm transition-colors ${
                session.pinned
                  ? 'text-amber-500 fill-amber-500'
                  : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400 opacity-0 group-hover:opacity-100'
              }`}
              title={session.pinned ? 'আনপিন করুন' : 'পিন করুন'}
            >
              <Star className={`w-3.5 h-3.5 ${session.pinned ? 'fill-amber-400 text-amber-500' : ''}`} />
            </button>
          )}

          <div className="min-w-0 flex-1">
            {renamingSessionId === session.id ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => saveRename(session.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRename(session.id);
                  if (e.key === 'Escape') setRenamingSessionId(null);
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs font-semibold px-1 py-0.5 bg-white dark:bg-zinc-800 border border-blue-500 rounded-md focus:outline-hidden"
              />
            ) : (
              <p
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startRename(session);
                }}
                title={title}
                className="font-medium truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 leading-snug"
              >
                {truncatedTitle}
              </p>
            )}

            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                {formatTimestamp(session.timestamp)}
              </span>
              <span className="text-[9px] px-1 py-0.2 rounded-xs bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">
                {session.sets?.length || 0} প্রশ্ন
              </span>
            </div>
          </div>
        </div>

        {/* Right Action Icons: Delete (🗑) + Menu */}
        {!isMultiSelectMode && (
          <div className="flex items-center gap-1 shrink-0">
            {/* Requirement 5: Distinct Delete (🗑) Icon */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`আপনি কি "${truncatedTitle}" কথোপকথনটি মুছে ফেলতে চান?`)) {
                  onDeleteSession(session.id);
                }
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-950/60 rounded text-zinc-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              title="মুছে ফেলুন"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenuSessionId(activeMenuSessionId === session.id ? null : session.id);
                  setActiveFolderPickerSessionId(null);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-colors opacity-0 group-hover:opacity-100"
                title="মেনু"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {activeMenuSessionId === session.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-6 z-40 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-1 text-xs space-y-0.5 select-none"
                >
                  <button
                    type="button"
                    onClick={() => startRename(session)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>নাম পরিবর্তন</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolderPickerSessionId(
                        activeFolderPickerSessionId === session.id ? null : session.id
                      );
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between text-zinc-700 dark:text-zinc-300"
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="w-3.5 h-3.5 text-zinc-400" />
                      <span>ফোল্ডারে সরাও</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  </button>

                  {activeFolderPickerSessionId === session.id && (
                    <div className="p-1 pl-2 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg space-y-0.5 border border-zinc-200/80 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() => {
                          onMoveToFolder(session.id, null);
                          setActiveMenuSessionId(null);
                          setActiveFolderPickerSessionId(null);
                        }}
                        className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 truncate"
                      >
                        • ফোল্ডার ছাড়া (সাম্প্রতিক)
                      </button>
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            onMoveToFolder(session.id, f.id);
                            setActiveMenuSessionId(null);
                            setActiveFolderPickerSessionId(null);
                          }}
                          className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 truncate"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                          <span className="truncate">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const md = exportSessionAsMarkdown(session, config);
                      downloadFile(md, `${session.title.slice(0, 25)}.md`, 'text/markdown');
                      setActiveMenuSessionId(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                    <span>ডাউনলোড (.md)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const txt = exportSessionAsText(session, config);
                      downloadFile(txt, `${session.title.slice(0, 25)}.txt`, 'text/plain');
                      setActiveMenuSessionId(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-400" />
                    <span>ডাউনলোড (.txt)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full w-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 select-none overflow-hidden text-zinc-900 dark:text-zinc-100">
      <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">কথোপকথন ইতিহাস</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">
            {sessions.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={openCreateFolder}
            className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="নতুন ফোল্ডার"
          >
            <FolderPlus className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
              setSelectedIds([]);
            }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isMultiSelectMode
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
            title="একাধিক বাছাই করুন"
          >
            <CheckSquare className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer md:hidden"
            title="বন্ধ করো"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Input (Requirement 6) */}
      <div className="p-2.5 border-b border-zinc-100 dark:border-zinc-800/80 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="কথোপকথন বা উত্তরে খুঁজুন..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Multi-select Action Bar */}
      {isMultiSelectMode && (
        <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/50 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {selectedIds.length === filteredSessions.length ? 'সব বাতিল' : 'সব বাছুন'}
            </button>
            <span className="text-[11px] text-zinc-500">({selectedIds.length} নির্বাচিত)</span>
          </div>

          <div className="flex items-center gap-1.5">
            {selectedIds.length > 0 && (
              <button
                onClick={() => setIsBatchMovePickerOpen(true)}
                className="px-2 py-1 rounded bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 text-[11px] font-medium"
              >
                ফোল্ডারে
              </button>
            )}

            {selectedIds.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm(`আপনি কি নির্বাচিত ${selectedIds.length}টি কথোপকথন মুছে ফেলতে চান?`)) {
                    onBatchDeleteSessions(selectedIds);
                    setSelectedIds([]);
                  }
                }}
                className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 rounded"
                title="মুছে ফেলুন"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {pinnedSessions.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              <span>পিন করা ({pinnedSessions.length})</span>
            </div>
            <div className="space-y-0.5 pl-1 border-l-2 border-amber-300 dark:border-amber-700/60 ml-2">
              {pinnedSessions.map(renderSessionRow)}
            </div>
          </div>
        )}

        {folders.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2 py-0.5 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              <span>ফোল্ডারসমূহ</span>
            </div>

            {folders.map((folder) => {
              const itemsInFolder = folderSessionsMap[folder.id] || [];
              const isCollapsed = Boolean(folder.collapsed);
              const isOver = dragOverFolderId === folder.id;

              return (
                <div
                  key={folder.id}
                  onDragOver={(e) => handleDragOver(e, folder.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, folder.id)}
                  className={`rounded-2xl transition-all border ${
                    isOver
                      ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-400/40'
                      : 'border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30'
                  }`}
                >
                  <div
                    onClick={() => onToggleFolderCollapse(folder.id)}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-zinc-400">
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </span>
                      {isCollapsed ? (
                        <Folder className="w-4 h-4 shrink-0" style={{ color: folder.color }} />
                      ) : (
                        <FolderOpen className="w-4 h-4 shrink-0" style={{ color: folder.color }} />
                      )}
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {folder.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-200/70 dark:bg-zinc-700/60 text-zinc-600 dark:text-zinc-400 font-mono shrink-0">
                        {itemsInFolder.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openEditFolder(folder)}
                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        title="সম্পাদনা"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFolderToDelete(folder)}
                        className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 rounded text-zinc-400 hover:text-red-500"
                        title="মুছুন"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="p-1 space-y-0.5 border-t border-zinc-100 dark:border-zinc-800/60">
                      {itemsInFolder.length === 0 ? (
                        <div className="py-2.5 px-3 text-center text-[11px] text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl my-1">
                          এখানে ড্র্যাগ করে রাখুন
                        </div>
                      ) : (
                        itemsInFolder.map(renderSessionRow)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div
          onDragOver={(e) => handleDragOver(e, null)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
          className="space-y-1 rounded-2xl p-1"
        >
          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            <span>সাম্প্রতিক কথোপকথন ({recentSessions.length})</span>
          </div>

          {recentSessions.length === 0 && folders.length === 0 && pinnedSessions.length === 0 ? (
            <div className="text-center py-12 px-4 text-zinc-400 dark:text-zinc-500">
              <MessageSquare className="w-7 h-7 mx-auto mb-2 opacity-40" />
              <p className="text-xs">কোনো কথোপকথন নেই</p>
            </div>
          ) : recentSessions.length === 0 ? (
            <div className="py-3 px-3 text-center text-[11px] text-zinc-400 italic">কোনো আনফাইল্ড কথোপকথন নেই</div>
          ) : (
            <div className="space-y-0.5">{recentSessions.map(renderSessionRow)}</div>
          )}
        </div>
      </div>

      {/* Footer: Export, Import, Clear All History */}
      <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800 shrink-0 space-y-1.5 bg-zinc-50/70 dark:bg-zinc-900/70">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={onExportAll}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            <span>এক্সপোর্ট</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>ইম্পোর্ট</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
        </div>

        {sessions.length > 0 && (
          <button
            onClick={onClearHistory}
            className="w-full py-1.5 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>সকল ইতিহাস মুছুন</span>
          </button>
        )}
      </div>

      {/* Modals */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveFolder}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-blue-500" />
                {editingFolderId ? 'ফোল্ডার সম্পাদনা' : 'নতুন ফোল্ডার'}
              </h3>
              <button type="button" onClick={() => setIsFolderModalOpen(false)} className="text-zinc-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">ফোল্ডারের নাম:</label>
              <input
                type="text"
                placeholder="নাম লিখুন..."
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                autoFocus
                className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">রং:</label>
              <div className="flex flex-wrap gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setFolderColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                      folderColor === c.hex ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsFolderModalOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={!folderName.trim()}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white"
              >
                সংরক্ষণ
              </button>
            </div>
          </form>
        </div>
      )}

      {folderToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <div className="flex items-center gap-2.5 text-amber-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">ফোল্ডার মুছবেন?</h3>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              ফোল্ডারটি মুছে ফেলা হবে, কিন্তু ভেতরের কথোপকথনগুলো সাম্প্রতিক অংশে চলে যাবে।
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setFolderToDelete(null)} className="px-3 py-1.5 text-xs text-zinc-600">
                বাতিল
              </button>
              <button
                onClick={() => {
                  onDeleteFolder(folderToDelete.id);
                  setFolderToDelete(null);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-red-600 text-white"
              >
                মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}

      {isBatchMovePickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-xs w-full p-4 shadow-2xl space-y-3">
            <h3 className="text-xs font-bold text-zinc-900 dark:text-white">ফোল্ডার নির্বাচন করুন</h3>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              <button
                onClick={() => {
                  onBatchMoveToFolder(selectedIds, null);
                  setIsBatchMovePickerOpen(false);
                  setSelectedIds([]);
                  setIsMultiSelectMode(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                • ফোল্ডার ছাড়া (সাম্প্রতিক)
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    onBatchMoveToFolder(selectedIds, f.id);
                    setIsBatchMovePickerOpen(false);
                    setSelectedIds([]);
                    setIsMultiSelectMode(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-2"
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setIsBatchMovePickerOpen(false)}
                className="px-3 py-1 rounded-lg text-xs text-zinc-500"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {importPendingData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-500" />
              ইম্পোর্ট কনফার্মেশন
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              ফাইল থেকে ডেটা সফলভাবে লোড হয়েছে। কীভাবে ইম্পোর্ট করতে চান?
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => {
                  onImportData(importPendingData, 'merge');
                  setImportPendingData(null);
                }}
                className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-blue-600 text-white text-center"
              >
                বর্তমান তথ্যের সাথে যোগ করুন (Merge)
              </button>
              <button
                onClick={() => {
                  onImportData(importPendingData, 'replace');
                  setImportPendingData(null);
                }}
                className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-red-600 text-white text-center"
              >
                সব প্রতিস্থাপন করুন (Replace all)
              </button>
              <button
                onClick={() => setImportPendingData(null)}
                className="w-full py-1.5 rounded-xl text-xs text-zinc-500"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
        <div
          className={`absolute top-0 bottom-0 left-0 w-80 max-w-[85vw] shadow-2xl transform transition-transform duration-200 ease-in-out ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </div>
      </div>

      <div
        className={`hidden md:flex shrink-0 transition-all duration-200 overflow-hidden ${
          isOpen ? 'w-80' : 'w-0'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}
